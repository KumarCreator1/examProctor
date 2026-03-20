-- =========================================================================
-- INTEGRITY: Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Extends Supabase Auth Users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('proctor', 'student')),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: RLS (Row Level Security) ensuring users can only read/update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (new.id, new.email, 'student', new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. Exams Table (Managed by Proctors)
CREATE TABLE public.exams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  proctor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proctors manage their own exams" 
ON public.exams FOR ALL USING (auth.uid() = proctor_id);

CREATE POLICY "Students can view exams" 
ON public.exams FOR SELECT USING (true);


-- 3. Sessions (Active or completed exam attempts)
-- Note: The signaling server will write to this using its SERVICE_ROLE key
CREATE TABLE public.sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, active, completed
  trust_score INTEGER DEFAULT 100,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own sessions" 
ON public.sessions FOR SELECT USING (auth.uid() = student_id);

-- Proctors can view sessions for exams they own
CREATE POLICY "Proctors view exam sessions" 
ON public.sessions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.exams 
    WHERE public.exams.id = public.sessions.exam_id 
    AND public.exams.proctor_id = auth.uid()
  )
);


-- 4. Flags (Audit logs of cheating events)
-- Note: The signaling server auto-inserts these using SERVICE_ROLE
CREATE TABLE public.flags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  level TEXT NOT NULL, -- YELLOW, RED
  code TEXT NOT NULL,  -- GAZE_AWAY, OBJECT_DETECTED, BROWSER_UNFOCUSED
  details JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

-- Only Proctors bounding the exam can view the flags, or the student themselves
CREATE POLICY "View flags policy" 
ON public.flags FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    JOIN public.exams ON public.sessions.exam_id = public.exams.id
    WHERE public.sessions.id = public.flags.session_id 
    AND (public.sessions.student_id = auth.uid() OR public.exams.proctor_id = auth.uid())
  )
);

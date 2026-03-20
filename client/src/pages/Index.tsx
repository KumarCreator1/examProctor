import { motion } from "framer-motion";
import { Shield, Eye, Wifi, Lock, Smartphone, Monitor, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  {
    icon: Eye,
    title: "Status Codes, Not Video",
    description: "Only lightweight JSON flags are transmitted. Zero video storage, zero cloud footage.",
  },
  {
    icon: Smartphone,
    title: "Dual-Device Architecture",
    description: "Phone as Sentinel monitors the desk. Laptop handles the exam. Two angles, one privacy promise.",
  },
  {
    icon: Lock,
    title: "On-Device AI",
    description: "TensorFlow.js runs entirely in the browser. No frames leave your device — ever.",
  },
  {
    icon: Wifi,
    title: "< 10kbps Per Student",
    description: "Text-only status codes mean hundreds of students on minimal bandwidth.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const Index = () => {
  return (
    <div className="min-h-screen bg-gray-950 font-sans text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-400" />
            <span className="text-lg font-bold text-white tracking-wide">Integrity</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
              Proctor Login
            </Link>
            <Link to="/terminal" className="px-5 py-2 rounded-md bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors">
              Start Exam
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="max-w-4xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 mb-8">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">Privacy-First Proctoring</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-tight mb-6">
              Status Codes,<br/>
              <span className="text-emerald-400">Not Video Streams</span>
            </h1>

            <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Integrity uses your phone as a local AI sentinel. Zero video storage.
              Zero cloud footage. Just honest exams.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/terminal" className="px-8 py-4 rounded-xl bg-emerald-500 text-white font-bold text-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                  Launch Exam Terminal
                  <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to="/login" className="px-8 py-4 rounded-xl bg-transparent border-2 border-gray-800 text-white font-bold text-lg hover:bg-gray-900 transition-colors">
                  Proctor Dashboard
              </Link>
            </div>
          </motion.div>

          {/* Architecture diagram */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20 max-w-4xl mx-auto"
          >
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <DeviceCard
                  icon={<Monitor className="h-8 w-8" />}
                  label="Exam Terminal"
                  desc="Browser lock + gaze tracking"
                  status="Laptop"
                />
                <div className="flex flex-col items-center gap-2 py-4 md:py-0">
                  <div className="text-xs font-mono text-gray-500 tracking-wider uppercase">WebSocket</div>
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
                  <code className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
                    {"{ status: 'CLEAR' }"}
                  </code>
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
                  <div className="text-xs font-mono text-gray-500 tracking-wider uppercase">JSON only</div>
                </div>
                <DeviceCard
                  icon={<Smartphone className="h-8 w-8" />}
                  label="Sentinel"
                  desc="Object detection on-device"
                  status="Phone"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 border-t border-gray-800/50 bg-gray-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Built on Zero-Knowledge Principles
            </h2>
            <p className="mt-4 text-gray-400 text-xl max-w-2xl mx-auto">
              The proctor knows <em>if</em> cheating happens — never <em>sees</em> your room.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-8 hover:border-emerald-500/30 transition-colors duration-300"
              >
                <div className="flex items-start gap-5">
                  <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white mb-2">{f.title}</h3>
                    <p className="text-gray-400 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 border-t border-gray-800 bg-gray-900/30">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-white text-center mb-16">How It Works</h2>
          <div className="space-y-12">
            {[
              { step: "01", title: "Scan QR Code", desc: "Open the Sentinel on your phone — no app install needed." },
              { step: "02", title: "Position Your Phone", desc: "Lean it against a mug for a desk-level view. The AR guide helps." },
              { step: "03", title: "Take Your Exam", desc: "AI runs locally on both devices. Only status codes reach the proctor." },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="flex items-start gap-8 bg-gray-900/50 p-6 md:p-10 rounded-2xl border border-gray-800/50"
              >
                <span className="text-5xl font-bold font-mono text-emerald-500/20">{s.step}</span>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{s.title}</h3>
                  <p className="text-gray-400 text-lg leading-relaxed">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12 bg-gray-950">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Shield className="h-5 w-5 text-emerald-500/50" />
            <span className="font-medium tracking-wider">INTEGRITY v1.0</span>
          </div>
          <span>Privacy-First Proctoring Ecosystem</span>
        </div>
      </footer>
    </div>
  );
};

const DeviceCard = ({ icon, label, desc, status }: { icon: React.ReactNode; label: string; desc: string; status: string }) => (
  <div className="flex flex-col items-center text-center gap-4 p-6 rounded-xl border border-gray-800 bg-gray-950/50 shadow-inner w-full">
    <div className="text-emerald-400 bg-emerald-400/10 p-4 rounded-full">{icon}</div>
    <div>
      <div className="font-bold text-white text-lg mb-1">{label}</div>
      <div className="text-sm text-gray-400">{desc}</div>
    </div>
    <span className="mt-2 text-[10px] font-mono uppercase tracking-widest text-gray-500 font-bold bg-gray-900 px-3 py-1 rounded-full border border-gray-800">{status}</span>
  </div>
);

export default Index;

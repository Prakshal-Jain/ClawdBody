'use client'

import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Github, Mail, Calendar, HardDrive, MessageSquare, MoreHorizontal } from 'lucide-react'

export function LandingPage() {
  const steps = [
    { number: '1', text: 'Connect your GitHub' },
    { number: '2', text: 'Get a cloud VM' },
    { number: '3', text: 'AI runs 24/7 inferring & executing tasks' },
  ]

  const integrations = [
    { name: 'Gmail', icon: Mail, color: 'text-red-400' },
    { name: 'Calendar', icon: Calendar, color: 'text-blue-400' },
    { name: 'Local Files', icon: HardDrive, color: 'text-green-400' },
    { name: 'Slack', icon: MessageSquare, color: 'text-purple-400' },
    { name: 'More', icon: MoreHorizontal, color: 'text-gray-400' },
  ]

  return (
    <div className="landing-page-container min-h-screen relative overflow-hidden bg-transparent">
      <div className="landing-nebula" />
      <div className="landing-stars" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 flex flex-col items-center gap-4"
          >
            <img 
              src="/logos/ClawdBrain.png" 
              alt="ClawdBody" 
              className="h-28 sm:h-32 lg:h-40 object-contain"
            />
            <span className="text-5xl sm:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent">
              ClawdBody
            </span>
          </motion.div>

          <motion.h1
            className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            1-Click ClawdBot deployment on VMs that runs 24/7 automating your life and business.
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Persistent memory. Sandboxed cloud VM. Works while you sleep.
          </motion.p>

          <motion.button
            onClick={() => signIn('github')}
            className="px-8 py-4 bg-gradient-to-r from-rose-500 to-teal-400 text-slate-950 font-semibold rounded-full text-lg shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              Start Free
            </span>
          </motion.button>
        </div>

        {/* How it works */}
        <motion.div
          className="mt-20 sm:mt-28"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                className="flex items-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
              >
                <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-teal-400 font-semibold">
                  {step.number}
                </div>
                <span className="text-gray-300 text-lg">{step.text}</span>
                {index < steps.length - 1 && (
                  <span className="hidden sm:block text-gray-600 ml-6">→</span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Integrations */}
        <motion.div
          className="mt-16 sm:mt-20 text-center"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          <p className="text-gray-500 mb-6 text-sm uppercase tracking-wider">Connects with</p>
          <div className="flex justify-center items-center gap-8 sm:gap-12">
            {integrations.map((integration, index) => (
              <motion.div
                key={integration.name}
                className="flex flex-col items-center gap-2"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.1 + index * 0.1, duration: 0.4 }}
              >
                <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                  <integration.icon className={`w-6 h-6 ${integration.color}`} />
                </div>
                <span className="text-sm text-gray-500">{integration.name}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Cloud Sandbox VMs */}
        <motion.div
          className="mt-16 sm:mt-20 text-center"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.6 }}
        >
          <p className="text-gray-500 mb-6 text-sm uppercase tracking-wider">Runs on</p>
          <div className="flex justify-center items-center gap-8 sm:gap-12">
            <motion.a
              href="https://orgo.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.4, duration: 0.4 }}
              whileHover={{ scale: 1.05 }}
            >
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <img src="/logos/orgo.png" alt="Orgo" className="w-7 h-7 object-contain" />
              </div>
              <span className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors">Orgo</span>
            </motion.a>

            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.5, duration: 0.4 }}
            >
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <img src="/logos/aws.png" alt="AWS" className="w-7 h-7 object-contain" />
              </div>
              <span className="text-sm text-gray-500">AWS</span>
            </motion.div>

            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.6, duration: 0.4 }}
            >
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                <img src="/logos/flyio.png" alt="Fly.io" className="w-7 h-7 object-contain" />
              </div>
              <span className="text-sm text-gray-500">Fly.io</span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

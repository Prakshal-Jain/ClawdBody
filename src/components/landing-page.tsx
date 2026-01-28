'use client'

import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Github, Calendar, HardDrive, MessageSquare, MoreHorizontal, ExternalLink } from 'lucide-react'
import Script from 'next/script'

// Discord Icon SVG Component
const DiscordIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
)

// Google Icon SVG Component
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

export function LandingPage() {
  const steps = [
    { number: '1', text: 'Sign in with Google' },
    { number: '2', text: 'Get a cloud VM' },
    { number: '3', text: 'AI runs 24/7 inferring & executing tasks' },
  ]

  const GmailIcon = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
    </svg>
  )

  const integrations = [
    { name: 'Gmail', icon: GmailIcon, color: 'text-red-400' },
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
        {/* GitHub Link - Top Right */}
        <motion.a
          href="https://github.com/Prakshal-Jain/ClawdBody"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-6 right-6 sm:top-8 sm:right-8 flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/20 transition-all group"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Github className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors hidden sm:inline">GitHub</span>
          <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-gray-300 transition-colors hidden sm:inline" />
        </motion.a>

        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 flex flex-col items-center gap-4"
          >
            <img 
              src="/logos/ClawdBody.png" 
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

          <motion.div
            className="inline-block bg-gradient-to-r from-rose-500 to-teal-400 rounded-full p-[2px] shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <button
              onClick={() => signIn('google')}
              className="px-8 py-4 bg-white text-slate-950 font-semibold rounded-full text-lg flex items-center gap-2 transition-all duration-300"
            >
              <GoogleIcon className="w-5 h-5" />
              Sign in with Google
            </button>
          </motion.div>

          {/* Twitter Launch Posts */}
          <motion.div
            className="mt-6 flex justify-center items-start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6 max-w-[1200px]">
              {/* Original Tweet */}
              <div className="w-full max-w-[380px] mx-auto scale-[0.85] sm:scale-90 min-h-[380px]">
                <blockquote className="twitter-tweet" data-conversation="none" data-theme="dark" data-dnt="true">
                  <p lang="en" dir="ltr">
                    Set up 100s of Clawd bots without touching the terminal. <br /><br />
                    You can now do it in just a few clicks.<br /><br />
                    I am adding them all to a groupchat.<br /><br />
                    Maybe they can start a company by working together?{' '}
                    <a href="https://t.co/8kAaT49iB6">pic.twitter.com/8kAaT49iB6</a>
                  </p>
                  &mdash; nick vasilescu (@nickvasiles){' '}
                  <a href="https://twitter.com/nickvasiles/status/2016374181160747259?ref_src=twsrc%5Etfw">
                    January 28, 2026
                  </a>
                </blockquote>
              </div>

              {/* Shoutout Tweet */}
              <div className="w-full max-w-[380px] mx-auto scale-[0.85] sm:scale-90 min-h-[380px]">
                <blockquote className="twitter-tweet" data-conversation="none" data-theme="dark" data-dnt="true">
                  <p lang="en" dir="ltr">
                    Huge shoutout to{' '}
                    <a href="https://twitter.com/prakshaljain_?ref_src=twsrc%5Etfw">@prakshaljain_</a>
                    <br /><br />
                    Here&#39;s his open sourced repo giving people an easy way to get started with Clawdbot
                    <a href="https://t.co/Xa3JPpWzLR">https://t.co/Xa3JPpWzLR</a>
                  </p>
                  &mdash; nick vasilescu (@nickvasiles){' '}
                  <a href="https://twitter.com/nickvasiles/status/2016374183962542233?ref_src=twsrc%5Etfw">
                    January 28, 2026
                  </a>
                </blockquote>
              </div>

              {/* Prakshal Tweet */}
              <div className="w-full max-w-[380px] mx-auto scale-[0.85] sm:scale-90 min-h-[380px]">
                <blockquote className="twitter-tweet" data-conversation="none" data-theme="dark" data-dnt="true">
                  <p lang="en" dir="ltr">
                    Install Clawd Bot automatically with this script.<br />
                    No need to spend $799 on Mac Mini!<br /><br />
                    Don&apos;t spend hours setting it up.<br /><br />
                    Let it run 24/7 on Orgo VM automating your life.{' '}
                    <a href="https://t.co/TNhKMqL69n">pic.twitter.com/TNhKMqL69n</a>
                  </p>
                  &mdash; Prakshal Jain (@prakshaljain_){' '}
                  <a href="https://twitter.com/prakshaljain_/status/2014931950105231653?ref_src=twsrc%5Etfw">
                    January 24, 2026
                  </a>
                </blockquote>
              </div>
            </div>
          </motion.div>

          {/* Community Section */}
          <motion.div
            className="mt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <div className="flex flex-row justify-center items-center gap-4 sm:gap-6">
              <motion.a
                href="https://discord.gg/u6nn9r4Cy5"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-gradient-to-br from-gray-900/50 to-gray-800/30 border border-gray-700/50 rounded-xl px-6 py-4 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300 flex items-center gap-3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                whileHover={{ y: -2, scale: 1.02 }}
              >
                <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors flex-shrink-0">
                  <DiscordIcon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-white">Discord</h3>
                  <p className="text-xs text-gray-400">Join the community</p>
                </div>
              </motion.a>

              <motion.a
                href="https://github.com/Prakshal-Jain/ClawdBody"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-gradient-to-br from-gray-900/50 to-gray-800/30 border border-gray-700/50 rounded-xl px-6 py-4 hover:border-rose-500/50 hover:shadow-lg hover:shadow-rose-500/10 transition-all duration-300 flex items-center gap-3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.4 }}
                whileHover={{ y: -2, scale: 1.02 }}
              >
                <div className="w-10 h-10 bg-rose-500/10 rounded-lg flex items-center justify-center group-hover:bg-rose-500/20 transition-colors flex-shrink-0">
                  <Github className="w-6 h-6 text-rose-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-white">GitHub</h3>
                  <p className="text-xs text-gray-400">View the source</p>
                </div>
              </motion.a>
            </div>
          </motion.div>
        </div>

        {/* Twitter Widget Script */}
        <Script
          src="https://platform.twitter.com/widgets.js"
          strategy="lazyOnload"
          charSet="utf-8"
        />

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

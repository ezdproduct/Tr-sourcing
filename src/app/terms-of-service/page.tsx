import React from 'react'
import Link from 'next/link'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { ArrowLeft, Scale, FileText, CheckCircle, Mail, AlertTriangle, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | TR Sourcing Hub',
  description: 'Understand the terms and conditions governing the use of TR Sourcing Hub.',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-955 text-slate-800 dark:text-slate-200 transition-colors duration-300">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80 transition-colors">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-all" aria-label="Back to login">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden">
              <img 
                src="/logo.svg" 
                alt="Transformer Robotics Logo" 
                className="h-full w-full object-contain" 
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-tight">TR Sourcing Hub</span>
              <span className="text-[10px] font-semibold text-slate-400">Privacy & Policies</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeSwitcher />
            <Link 
              href="/auth/login" 
              className="rounded-lg bg-[#5c59e9] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#4a47d2] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container mx-auto max-w-6xl px-4 py-10 sm:px-6 relative z-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          
          {/* Sidebar Navigation - Table of Contents */}
          <aside className="lg:col-span-1 lg:block hidden">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-5 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/40">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Sections</h3>
                <nav className="flex flex-col gap-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <a href="#acceptance" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">1. Acceptance of Terms</a>
                  <a href="#eligibility" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">2. Account Approval</a>
                  <a href="#conduct" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">3. Permitted Conduct</a>
                  <a href="#confidentiality" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">4. Confidentiality & IP</a>
                  <a href="#disclaimers" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">5. Disclaimers & Uptime</a>
                  <a href="#liability" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">6. Limitation of Liability</a>
                  <a href="#governing" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">7. Governing Law</a>
                </nav>
              </div>

              {/* Alert Note */}
              <div className="rounded-2xl border border-amber-100/30 bg-amber-55/30 p-5 dark:border-amber-900/20 dark:bg-amber-950/10">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                  <AlertTriangle size={16} />
                  <span className="text-xs font-bold">Important Notice</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  This Platform contains highly confidential supply chain information. Any unauthorized access, extraction, or sharing of supplier details is strictly prohibited.
                </p>
              </div>
            </div>
          </aside>

          {/* Policy Document Body */}
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/70 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 p-6 sm:p-10">
              
              {/* Document Header */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-[#5c59e9] dark:bg-indigo-950/40 dark:text-indigo-400 mb-3">
                  <Scale size={12} />
                  <span>Enterprise Terms & Guidelines</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  Terms of Service
                </h1>
                <p className="text-xs text-slate-455 dark:text-slate-500 mt-2 font-medium">
                  Last Updated: July 3, 2026
                </p>
              </div>

              {/* Document Sections */}
              <div className="space-y-8 text-sm leading-relaxed text-slate-600 dark:text-slate-350">
                
                {/* 1. Acceptance of Terms */}
                <section id="acceptance" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">1</span>
                    Acceptance of Terms
                  </h2>
                  <p>
                    By registering for, accessing, or using the <strong>Transformer Robotics Sourcing Hub</strong> (the &quot;Platform&quot;), you agree to comply with and be bound by these Terms of Service. If you are entering into this agreement on behalf of a department or partner organization, you represent that you possess the necessary authorization.
                  </p>
                </section>

                {/* 2. Account Eligibility & Approval */}
                <section id="eligibility" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">2</span>
                    Account Registration & Administrator Approval
                  </h2>
                  <p>
                    Access to Sourcing Hub is strictly restricted to authorized employees, contractors, and verified suppliers of <strong>Transformer Robotics</strong>.
                  </p>
                  <p className="bg-slate-50 dark:bg-slate-950/45 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                    <strong>Note on Approval:</strong> Account creation does not automatically grant database access. Every new account is set to pending status and must be manually approved by a system administrator. The administration reserves the right to deny or revoke access context at any time.
                  </p>
                </section>

                {/* 3. Permitted & Prohibited Conduct */}
                <section id="conduct" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">3</span>
                    Permitted Conduct & Platform Rules
                  </h2>
                  <p>
                    The Platform may only be used for legitimate procurement operations:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Evaluating manufacturers and supplier capabilities.</li>
                    <li>Updating order tracking matrices and production batch histories.</li>
                    <li>Conducting quality audits, uploading compliance certificates, and logging safety records.</li>
                  </ul>
                  <p>
                    You are strictly prohibited from sharing user credentials, bypassing authorization constraints, extracting mass datasets without approval, or uploading files containing malware.
                  </p>
                </section>

                {/* 4. Confidentiality & Intellectual Property */}
                <section id="confidentiality" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">4</span>
                    Confidentiality & Proprietary Data
                  </h2>
                  <div className="flex gap-3 items-start bg-indigo-50/20 dark:bg-indigo-950/5 p-4 rounded-xl border border-indigo-100/30 dark:border-indigo-900/10">
                    <ShieldCheck className="text-[#5c59e9] dark:text-indigo-400 mt-0.5 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white mb-1">Confidential Information</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        All supplier profiles, contact information, price lists, audit findings, inspection reports, and logistics tracking matrices visible on the Platform are classified as highly confidential intellectual property of <strong>Transformer Robotics</strong>. 
                      </p>
                    </div>
                  </div>
                  <p className="pt-2">
                    Users must treat this information as strictly confidential. You may not distribute, print, publish, or leverage Sourcing Hub information for competing commercial ventures or disclose them to external third parties.
                  </p>
                </section>

                {/* 5. Service Availability & Disclaimers */}
                <section id="disclaimers" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">5</span>
                    Service Availability & Disclaimers
                  </h2>
                  <p>
                    Sourcing Hub is provided on an &quot;as-is&quot; and &quot;as-available&quot; basis. While we strive to maintain uninterrupted service, Transformer Robotics does not warrant that the Platform will be free from errors, bugs, or downtime. Uptime is dependent on underlying host services (Supabase, Vercel) and local network environments.
                  </p>
                </section>

                {/* 6. Limitation of Liability */}
                <section id="liability" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">6</span>
                    Limitation of Liability
                  </h2>
                  <p>
                    To the maximum extent permitted by applicable law, Transformer Robotics, its directors, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your access to or inability to use the Platform.
                  </p>
                </section>

                {/* 7. Governing Law */}
                <section id="governing" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">7</span>
                    Governing Law
                  </h2>
                  <p>
                    These Terms of Service are governed by and construed in accordance with the laws of the jurisdiction in which Transformer Robotics is registered, without giving effect to conflict of law principles. Any dispute arising under these terms shall be subject to the exclusive jurisdiction of the competent courts of said territory.
                  </p>
                </section>

              </div>

              {/* Support / Contact Glassmorphism Card */}
              <div className="mt-10 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Mail size={15} className="text-[#5c59e9] dark:text-indigo-400" />
                    Questions about these Terms?
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Contact the administrator for policy and platform guidelines.
                  </p>
                </div>
                <div className="flex gap-2">
                  <a href="mailto:admin@transformerrobotics.com" className="inline-flex h-9 items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 px-4 text-xs font-bold text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
                    Email Support
                  </a>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Simple Footer */}
      <footer className="border-t border-slate-255/10 dark:border-slate-900 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
        <p>&copy; {new Date().getFullYear()} Transformer Robotics. All rights reserved.</p>
      </footer>
    </div>
  )
}

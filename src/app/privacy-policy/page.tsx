import React from 'react'
import Link from 'next/link'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { ArrowLeft, Shield, FileText, CheckCircle, Mail, Globe, Lock } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | TR Sourcing Hub',
  description: 'Learn how TR Sourcing Hub collects, uses, and protects your account and supplier data.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors duration-300">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

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
                  <a href="#introduction" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">1. Scope & Introduction</a>
                  <a href="#collection" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">2. Information We Collect</a>
                  <a href="#usage" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">3. How We Use Data</a>
                  <a href="#sharing" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">4. Sharing & Disclosure</a>
                  <a href="#security" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">5. Security & Isolation</a>
                  <a href="#rights" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">6. Your Rights & Choices</a>
                  <a href="#updates" className="hover:text-[#5c59e9] dark:hover:text-indigo-400 transition-colors">7. Policy Updates</a>
                </nav>
              </div>

              {/* Quick Summary Card */}
              <div className="rounded-2xl border border-indigo-100/30 bg-indigo-50/30 p-5 dark:border-indigo-900/20 dark:bg-indigo-950/10">
                <div className="flex items-center gap-2 text-[#5c59e9] dark:text-indigo-400 mb-2">
                  <Shield size={16} />
                  <span className="text-xs font-bold">Privacy Promise</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  We are committed to securing enterprise supplier relationships and factory audit records through industry-standard encryption and strict authorization controls.
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
                  <Lock size={12} />
                  <span>Secure Procurement Platform</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  Privacy Policy
                </h1>
                <p className="text-xs text-slate-455 dark:text-slate-500 mt-2 font-medium">
                  Last Updated: July 3, 2026
                </p>
              </div>

              {/* Document Sections */}
              <div className="space-y-8 text-sm leading-relaxed text-slate-600 dark:text-slate-350">
                
                {/* 1. Introduction */}
                <section id="introduction" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">1</span>
                    Scope & Introduction
                  </h2>
                  <p>
                    Welcome to the <strong>Transformer Robotics Sourcing Hub</strong> (hereinafter referred to as the &quot;Platform&quot; or &quot;Sourcing Hub&quot;), an enterprise software system managed and operated by <strong>Transformer Robotics</strong>. 
                  </p>
                  <p>
                    This Privacy Policy outlines how Sourcing Hub collects, stores, processes, and secures information related to users, organizations, suppliers, quality audits, logistics, and production metrics. By accessing the Platform or registering an account, you consent to the practices described in this policy.
                  </p>
                </section>

                {/* 2. Information We Collect */}
                <section id="collection" className="scroll-mt-24 space-y-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">2</span>
                    Information We Collect
                  </h2>
                  <p>
                    To provide a robust procurement matrix and facilitate supply chain transparency, we collect the following categories of information:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="rounded-xl border border-slate-200/50 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-950/30">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-[#5c59e9] dark:text-indigo-400" />
                        User Account Data
                      </h3>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        Email addresses, encrypted credentials, organizational roles (e.g., administrator, staff, executive boss), and departmental assignments (e.g., sourcing, logistics, inspection).
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/50 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-950/30">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-[#5c59e9] dark:text-indigo-400" />
                        Supplier & Factory Records
                      </h3>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        Corporate names, contact directories, production capacity records, tax status, business licenses, certifications, and financial terms (e.g., payment cycles).
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/50 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-950/30">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-[#5c59e9] dark:text-indigo-400" />
                        Audits & Inspection Data
                      </h3>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        Factory assessment checklists, safety audits, product verification standards, photo files, quality assurance scores, and compliance metrics.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/50 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-950/30">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-[#5c59e9] dark:text-indigo-400" />
                        Technical Logs & Telemetry
                      </h3>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        IP addresses, login timestamps, device specifications, browser cookies, application event histories, and transaction histories.
                      </p>
                    </div>
                  </div>
                </section>

                {/* 3. How We Use Data */}
                <section id="usage" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">3</span>
                    How We Use Data
                  </h2>
                  <p>
                    Information collected via Sourcing Hub is utilized strictly to deliver, monitor, and optimize our procurement operations:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>To facilitate supplier evaluation, factory matching, and order assignment.</li>
                    <li>To process and record quality inspections, safety assessments, and progress metrics.</li>
                    <li>To authenticate platform users and verify authorization level permissions (Admin, Boss, and Staff).</li>
                    <li>To maintain detailed audit logs and activity histories for enterprise compliance.</li>
                    <li>To analyze system performance and address technical issues.</li>
                  </ul>
                </section>

                {/* 4. Sharing & Disclosure */}
                <section id="sharing" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">4</span>
                    Sharing & Disclosure
                  </h2>
                  <p>
                    We prioritize confidential supplier relationships and do not sell or monetize any data. Information is disclosed only under the following conditions:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Service Providers:</strong> We share necessary data with trusted cloud providers (Supabase database services, AWS S3 storage, and Vercel hosting infrastructures).</li>
                    <li><strong>Enterprise Access:</strong> Your profile, audits, and entries are visible to the company administration and team members based on department and role rules.</li>
                    <li><strong>Legal Obligations:</strong> We may disclose information if required by law or to protect our legal rights.</li>
                  </ul>
                </section>

                {/* 5. Security & Isolation */}
                <section id="security" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">5</span>
                    Security & Isolation
                  </h2>
                  <p>
                    Transformer Robotics implements comprehensive security controls to defend procurement pipelines:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Data Isolation:</strong> Supplier information and company documents are partitioned securely in Supabase storage and databases.</li>
                    <li><strong>Encryption:</strong> All network traffic is encrypted via TLS protocols, and static fields are guarded with database-level security protocols.</li>
                    <li><strong>Role-Based Access Control (RBAC):</strong> Access rules restrict file permissions based on roles. Staff can only access their specific department&apos;s records, preventing internal leaks.</li>
                  </ul>
                </section>

                {/* 6. Your Rights & Choices */}
                <section id="rights" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">6</span>
                    Your Rights & Choices
                  </h2>
                  <p>
                    As an authenticated user, you hold various management controls:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Information Updates:</strong> Request account corrections directly through the designated Platform Administrator.</li>
                    <li><strong>Access Logs:</strong> Request logs of your transaction history and page interactions.</li>
                    <li><strong>Account Deactivation:</strong> Request account termination. Any associated data remains subject to institutional retention rules for history validation.</li>
                  </ul>
                </section>

                {/* 7. Policy Updates */}
                <section id="updates" className="scroll-mt-24 space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#5c59e9] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">7</span>
                    Policy Updates
                  </h2>
                  <p>
                    We may update this Privacy Policy from time to time to align with system modifications or regulatory shifts. The &quot;Last Updated&quot; marker at the top indicates the latest change. Continual utilization of the Platform signifies consent to updated versions.
                  </p>
                </section>

              </div>

              {/* Support / Contact Glassmorphism Card */}
              <div className="mt-10 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Mail size={15} className="text-[#5c59e9] dark:text-indigo-400" />
                    Need support or have questions?
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Reach out to our system administrator for security and data concerns.
                  </p>
                </div>
                <div className="flex gap-2">
                  <a href="mailto:admin@transformerrobotics.com" className="inline-flex h-9 items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 px-4 text-xs font-bold text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
                    Contact Security
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

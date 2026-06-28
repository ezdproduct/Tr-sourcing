'use client'

import React, { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toggleApprovalAction, updateUserRoleAndDeptAction, deleteUserAction, createUserAction } from './actions'
import { 
  Users2, 
  Check, 
  X, 
  ShieldAlert, 
  Loader2, 
  UserCheck, 
  UserX,
  Shield,
  Briefcase,
  Trash2,
  AlertCircle,
  Plus
} from 'lucide-react'

interface DatabaseProfile {
  id: string
  email: string
  role: string
  department: string
  is_approved: boolean
  updated_at: string
}

interface ManagementClientProps {
  initialProfiles: DatabaseProfile[]
}

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'boss', label: 'Boss' },
  { value: 'staff', label: 'Staff' }
]

const departmentOptions = [
  { value: 'all', label: 'All Departments' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'orders', label: 'Order Management' },
  { value: 'sourcing', label: 'Sourcing Management' },
  { value: 'audit', label: 'Quality Control' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'logistics', label: 'Logistics & Inventory' },
  { value: 'production', label: 'Production' }
]

export function ManagementClient({ initialProfiles }: ManagementClientProps) {
  const [profiles, setProfiles] = useState<DatabaseProfile[]>(initialProfiles)
  const [isPending, startTransition] = useTransition()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Create User States
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('1')
  const [newRole, setNewRole] = useState('staff')
  const [newDept, setNewDept] = useState('orders')
  const [addError, setAddError] = useState<string | null>(null)
  const [isCreatingUser, setIsCreatingUser] = useState(false)

  const handleToggleApproval = (id: string, currentStatus: boolean) => {
    setUpdatingId(id)
    setMessage(null)
    
    startTransition(async () => {
      const newStatus = !currentStatus
      const res = await toggleApprovalAction(id, newStatus)
      if (res.success) {
        setProfiles(prev =>
          prev.map(p => p.id === id ? { ...p, is_approved: newStatus } : p)
        )
        setMessage({ type: 'success', text: 'Approval status updated successfully.' })
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update approval status.' })
      }
      setUpdatingId(null)
    })
  }

  const handleRoleDeptChange = (id: string, role: string, dept: string) => {
    setUpdatingId(id)
    setMessage(null)

    startTransition(async () => {
      const res = await updateUserRoleAndDeptAction(id, role, dept)
      if (res.success) {
        setProfiles(prev =>
          prev.map(p => p.id === id ? { ...p, role, department: dept } : p)
        )
        setMessage({ type: 'success', text: 'User permissions updated successfully.' })
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update user permissions.' })
      }
      setUpdatingId(null)
    })
  }

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)
    setIsCreatingUser(true)

    try {
      const finalDept = newRole === 'staff' ? newDept : 'all'
      const res = await createUserAction(newEmail, newPassword, newRole, finalDept)
      if (res.success) {
        const newUser: DatabaseProfile = {
          id: res.userId!,
          email: newEmail,
          role: newRole,
          department: finalDept,
          is_approved: true,
          updated_at: new Date().toISOString()
        }
        setProfiles(prev => [...prev, newUser].sort((a, b) => a.email.localeCompare(b.email)))
        setMessage({ type: 'success', text: `Account for ${newEmail} created successfully.` })
        setIsAddUserOpen(false)
        setNewEmail('')
        setNewPassword('1')
        setNewRole('staff')
        setNewDept('orders')
      } else {
        setAddError(res.error || 'Failed to create user account.')
      }
    } catch (err: any) {
      setAddError(err.message || 'An error occurred.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  const handleDeleteUser = () => {
    if (!confirmDeleteId) return
    const idToDelete = confirmDeleteId
    setConfirmDeleteId(null)
    setUpdatingId(idToDelete)
    setMessage(null)

    startTransition(async () => {
      const res = await deleteUserAction(idToDelete)
      if (res.success) {
        setProfiles(prev => prev.filter(p => p.id !== idToDelete))
        setMessage({ type: 'success', text: 'User account deleted successfully.' })
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to delete user account.' })
      }
      setUpdatingId(null)
    })
  }

  return (
    <div className="space-y-6">

      {message && (
        <div className={`p-3 text-xs rounded-xl flex items-center gap-2 border font-semibold animate-in fade-in duration-200 max-w-xl ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-600 border-emerald-100/30 dark:bg-emerald-950/20' 
            : 'bg-rose-50 text-rose-600 border-rose-100/30 dark:bg-rose-950/20'
        }`}>
          {message.type === 'success' ? <Check size={14} /> : <ShieldAlert size={14} />}
          <span>{message.text}</span>
        </div>
      )}

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Users2 size={18} className="text-[#5c59e9]" />
              <span>Authorized System Profiles</span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              A list of all users registered. Approved users can log in to their assigned tabs.
            </CardDescription>
          </div>
          <Button
            onClick={() => setIsAddUserOpen(true)}
            size="sm"
            className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Plus size={14} />
            <span>Add User</span>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {profiles.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-center min-h-[300px]">
              <Users2 size={36} className="text-slate-200 dark:text-slate-700" />
              <p className="text-sm text-slate-400 font-medium">No registered profiles found</p>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <th className="px-6 py-4">User Email</th>
                    <th className="px-6 py-4">System Role</th>
                    <th className="px-6 py-4">Assigned Department</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {profiles.map(profile => {
                    const isUpdating = updatingId === profile.id
                    return (
                      <tr key={profile.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                        {/* Email */}
                        <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                          {profile.email}
                        </td>
                        
                        {/* Role dropdown */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Shield size={12} className="text-slate-400" />
                            <select
                              value={profile.role}
                              disabled={isUpdating || isPending}
                              onChange={(e) => {
                                const nextRole = e.target.value
                                let nextDept = profile.department
                                if (nextRole === 'staff' && (nextDept === 'all' || nextDept === 'dashboard')) {
                                  nextDept = 'orders'
                                } else if (nextRole === 'boss') {
                                  nextDept = 'dashboard'
                                } else if (nextRole === 'admin') {
                                  nextDept = 'all'
                                }
                                handleRoleDeptChange(profile.id, nextRole, nextDept)
                              }}
                              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white/50 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 focus:outline-none focus:ring-1 focus:ring-[#5c59e9]/30 disabled:opacity-50 cursor-pointer"
                            >
                              {roleOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Department dropdown */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Briefcase size={12} className="text-slate-400" />
                            <select
                              value={profile.department}
                              disabled={isUpdating || isPending || profile.role !== 'staff'}
                              onChange={(e) => handleRoleDeptChange(profile.id, profile.role, e.target.value)}
                              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white/50 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 focus:outline-none focus:ring-1 focus:ring-[#5c59e9]/30 disabled:opacity-50 cursor-pointer"
                            >
                              {departmentOptions
                                .filter(opt => {
                                  if (profile.role === 'staff') {
                                    return opt.value !== 'all' && opt.value !== 'dashboard'
                                  }
                                  if (profile.role === 'boss') {
                                    return opt.value === 'dashboard'
                                  }
                                  if (profile.role === 'admin') {
                                    return opt.value === 'all'
                                  }
                                  return true
                                })
                                .map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4 text-center">
                          {profile.is_approved ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/60 font-semibold text-[10px] px-2 py-0.5 rounded-full">
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60 font-semibold text-[10px] px-2 py-0.5 rounded-full">
                              Pending Approval
                            </Badge>
                          )}
                        </td>

                        {/* Toggle Approval and Delete Buttons */}
                        <td className="px-6 py-4 text-right font-semibold">
                          <div className="flex justify-end items-center gap-2">
                            {profile.is_approved ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isUpdating || isPending}
                                onClick={() => handleToggleApproval(profile.id, true)}
                                className="h-8 px-2.5 border-slate-200 text-amber-600 hover:text-amber-700 dark:border-slate-850 hover:bg-amber-50/30 cursor-pointer gap-1"
                              >
                                {isUpdating && updatingId === profile.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <UserX size={12} />
                                )}
                                <span>Revoke</span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={isUpdating || isPending}
                                onClick={() => handleToggleApproval(profile.id, false)}
                                className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer gap-1"
                              >
                                {isUpdating && updatingId === profile.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <UserCheck size={12} />
                                )}
                                <span>Approve</span>
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isUpdating || isPending}
                              onClick={() => setConfirmDeleteId(profile.id)}
                              className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 cursor-pointer rounded-lg flex items-center justify-center"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete User Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-450 mb-4">
              <AlertCircle size={22} className="flex-shrink-0 text-rose-600 dark:text-rose-450" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete User Account</h3>
            </div>
            
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to permanently delete the account for <strong className="font-semibold text-slate-800 dark:text-slate-200">{profiles.find(p => p.id === confirmDeleteId)?.email}</strong>? This action will remove all user records and access credentials.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 h-9 text-sm cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteUser}
                className="flex-1 h-9 text-sm bg-rose-600 hover:bg-rose-700 text-white cursor-pointer gap-2"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsAddUserOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create User Account</h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-4">
              {addError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 text-xs rounded-xl flex items-center gap-2 font-medium border border-rose-100/30">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Email Address
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="name@transformerroboctic.com"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-9 text-xs rounded-xl border-slate-200/80 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter user password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-9 text-xs rounded-xl border-slate-200/80 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-role" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    System Role
                  </Label>
                  <select
                    id="new-role"
                    value={newRole}
                    onChange={(e) => {
                      const role = e.target.value
                      setNewRole(role)
                      if (role === 'boss') {
                        setNewDept('dashboard')
                      } else if (role === 'admin') {
                        setNewDept('all')
                      } else {
                        setNewDept('orders')
                      }
                    }}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white/50 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 focus:outline-none focus:ring-1 focus:ring-[#5c59e9]/30 cursor-pointer"
                  >
                    {roleOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-dept" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Department
                  </Label>
                  <select
                    id="new-dept"
                    value={newDept}
                    disabled={newRole !== 'staff'}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white/50 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 focus:outline-none focus:ring-1 focus:ring-[#5c59e9]/30 disabled:opacity-50 cursor-pointer"
                  >
                    {departmentOptions
                      .filter(opt => {
                        if (newRole === 'staff') {
                          return opt.value !== 'all' && opt.value !== 'dashboard'
                        }
                        if (newRole === 'boss') {
                          return opt.value === 'dashboard'
                        }
                        if (newRole === 'admin') {
                          return opt.value === 'all'
                        }
                        return true
                      })
                      .map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddUserOpen(false)}
                  className="flex-1 h-9 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingUser}
                  className="flex-1 h-9 text-xs font-semibold bg-[#5c59e9] hover:bg-[#4a47d2] text-white cursor-pointer gap-2"
                >
                  {isCreatingUser && <Loader2 size={12} className="animate-spin" />}
                  <span>Create Account</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

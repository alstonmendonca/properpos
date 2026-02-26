'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  Shield,
  Mail,
  UserCheck,
  UserX,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier';
  status: 'active' | 'inactive' | 'pending';
  lastActive?: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export default function UsersSettingsPage() {
  const addToast = useUIStore(s => s.addToast);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setRoles([
          { id: 'owner', name: 'Owner', description: 'Full access to all features', permissions: ['*'] },
          { id: 'admin', name: 'Admin', description: 'Manage settings, users, and reports', permissions: ['settings', 'users', 'reports', 'pos', 'products', 'customers', 'orders'] },
          { id: 'manager', name: 'Manager', description: 'Access to POS, reports, and inventory', permissions: ['pos', 'products', 'customers', 'orders', 'reports', 'inventory'] },
          { id: 'cashier', name: 'Cashier', description: 'POS access only', permissions: ['pos', 'orders'] },
        ]);

        const response = await apiClient.get<any>('/tenants/current/members');
        const members = response.data?.data || response.data || [];
        setUsers(Array.isArray(members) ? members : []);
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Failed to load team members',
          message: 'Please try again',
        });
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredUsers = users.filter(user => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      if (!fullName.includes(query) && !user.email.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (selectedRole !== 'all' && user.role !== selectedRole) {
      return false;
    }
    return true;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      case 'admin': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'manager': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'cashier': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <UserCheck className="w-4 h-4 text-green-500" />;
      case 'inactive': return <UserX className="w-4 h-4 text-muted-foreground" />;
      case 'pending': return <Mail className="w-4 h-4 text-yellow-500" />;
      default: return null;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;

    setInviteLoading(true);
    try {
      await apiClient.post('/tenants/current/members/invite', {
        email: inviteEmail,
        role: inviteRole,
      });

      addToast({
        type: 'success',
        title: 'Invitation sent',
        message: `An invitation has been sent to ${inviteEmail}`,
      });

      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('cashier');
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to send invitation',
        message: 'Please try again',
      });
    } finally {
      setInviteLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="h-12 bg-muted rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Users & Roles</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members and their permissions
          </p>
        </div>
        <Button className="cursor-pointer" onClick={() => setInviteModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Roles Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {roles.map(role => (
          <Card key={role.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <Shield className={cn(
                  'w-5 h-5',
                  role.id === 'owner' ? 'text-purple-500' :
                  role.id === 'admin' ? 'text-blue-500' :
                  role.id === 'manager' ? 'text-green-500' : 'text-muted-foreground'
                )} />
                <h3 className="font-medium text-foreground">{role.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{role.description}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {users.filter(u => u.role === role.id).length} users
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
              />
            </div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
            >
              <option value="all">All Roles</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">User</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Role</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Last Active</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr
                    key={user.id}
                    className="border-b border-border hover:bg-accent"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-primary font-medium">
                            {user.firstName[0]}{user.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={cn('text-xs px-2 py-1 rounded-full capitalize', getRoleBadge(user.role))}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(user.status)}
                        <span className={cn(
                          'text-sm capitalize',
                          user.status === 'active' ? 'text-green-600' :
                          user.status === 'pending' ? 'text-yellow-600' : 'text-muted-foreground'
                        )}>
                          {user.status}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-muted-foreground">
                        {formatDate(user.lastActive)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button className="p-1 hover:bg-accent rounded cursor-pointer" title="Edit">
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-1 hover:bg-accent rounded cursor-pointer" title="Reset Password">
                          <Key className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {user.role !== 'owner' && (
                          <button className="p-1 hover:bg-accent rounded cursor-pointer" title="Delete">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInviteModalOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Invite User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                >
                  {roles.filter(r => r.id !== 'owner').map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => setInviteModalOpen(false)}>
                  Cancel
                </Button>
                <Button className="flex-1 cursor-pointer" onClick={handleInvite} disabled={!inviteEmail || inviteLoading}>
                  <Mail className="w-4 h-4 mr-2" />
                  {inviteLoading ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

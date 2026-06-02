"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { User, Plus, Pencil, Trash2, KeyRound, Shield } from "lucide-react";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";
  const currentUserId = (session?.user as { id?: string })?.id;

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);

  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [profileMsg, setProfileMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "STAFF", password: "" });
  const [userMsg, setUserMsg] = useState("");

  useEffect(() => {
    if (session?.user) {
      setProfileForm({ name: session.user.name ?? "", email: session.user.email ?? "" });
    }
  }, [session]);

  useEffect(() => {
    if (isOwner) {
      fetch("/api/users").then((r) => r.json()).then(setUsers);
    }
  }, [isOwner]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg("");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    setProfileSaving(false);
    if (res.ok) {
      await updateSession({ name: profileForm.name, email: profileForm.email });
      setProfileMsg("Profile updated.");
    } else {
      const data = await res.json();
      setProfileMsg(data.error ?? "Failed to update.");
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg("New passwords do not match.");
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwMsg("Password must be at least 8 characters.");
      return;
    }
    setPwSaving(true);
    setPwMsg("");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    });
    setPwSaving(false);
    if (res.ok) {
      setPwMsg("Password changed.");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } else {
      const data = await res.json();
      setPwMsg(data.error ?? "Failed to change password.");
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setUserMsg("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (res.ok) {
      const user = await res.json();
      setUsers((prev) => [...prev, user]);
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "STAFF" });
    } else {
      const data = await res.json();
      setUserMsg(data.error ?? "Failed to add user.");
    }
  }

  function openEdit(u: UserRecord) {
    setEditTarget(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, password: "" });
    setUserMsg("");
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setUserMsg("");
    const res = await fetch(`/api/users/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditTarget(null);
    } else {
      const data = await res.json();
      setUserMsg(data.error ?? "Failed to update user.");
    }
  }

  async function handleDeleteUser(id: string, name: string) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to delete user.");
    }
  }

  return (
    <div>
      <Header title="Settings" description="Your profile and user management" />

      <div className="p-6 space-y-6 max-w-2xl">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              {profileMsg && (
                <p className={`text-sm ${profileMsg.includes("updated") ? "text-green-600" : "text-red-600"}`}>
                  {profileMsg}
                </p>
              )}
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Current Password</Label>
                <Input
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  autoComplete="new-password"
                />
              </div>
              {pwMsg && (
                <p className={`text-sm ${pwMsg.includes("changed") ? "text-green-600" : "text-red-600"}`}>
                  {pwMsg}
                </p>
              )}
              <Button type="submit" disabled={pwSaving}>
                {pwSaving ? "Saving…" : "Change Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* User Management — owner only */}
        {isOwner && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Users
              </CardTitle>
              <Button size="sm" onClick={() => { setUserMsg(""); setAddOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add User
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{u.name}</span>
                        <Badge variant={u.role === "OWNER" ? "default" : "secondary"}>
                          {u.role}
                        </Badge>
                        {u.id === currentUserId && (
                          <Badge variant="outline" className="text-xs">you</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{u.email} · added {formatDate(u.createdAt)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {u.id !== currentUserId && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id, u.name)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input type="password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff — limited access</SelectItem>
                  <SelectItem value="OWNER">Owner — full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {userMsg && <p className="text-sm text-red-600">{userMsg}</p>}
            <Button type="submit" className="w-full">Create User</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="OWNER">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reset Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></Label>
              <Input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
            </div>
            {userMsg && <p className="text-sm text-red-600">{userMsg}</p>}
            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

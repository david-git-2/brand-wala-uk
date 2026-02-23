import { useCallback, useEffect, useMemo, useState } from "react";
import { UK_API } from "@/api/ukApi";
import { useAuth } from "@/auth/AuthProvider";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDeleteDialog from "@/components/common/ConfirmDeleteDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function UsersSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
            {Array.from({ length: 5 }).map((__, j) => (
              <Skeleton key={j} className="h-9" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const email = user?.email || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetEmail, setDeleteTargetEmail] = useState("");
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameTargetEmail, setNameTargetEmail] = useState("");
  const [nameDraft, setNameDraft] = useState("");

  const [createForm, setCreateForm] = useState({
    user_email: "",
    name: "",
    role: "customer",
    active: "1",
    can_see_price_gbp: "0",
  });

  const loadUsers = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const res = await UK_API.userGetAll(email);
      setUsers(Array.isArray(res.users) ? res.users : []);
    } catch (e) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const a = String(u.email || "").toLowerCase();
      const b = String(u.name || "").toLowerCase();
      const c = String(u.role || "").toLowerCase();
      return a.includes(needle) || b.includes(needle) || c.includes(needle);
    });
  }, [users, q]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!email) return;

    setSaving(true);
    setError("");
    try {
      await UK_API.userCreate(email, {
        user_email: createForm.user_email.trim(),
        name: createForm.name.trim(),
        role: createForm.role,
        active: Number(createForm.active),
        can_see_price_gbp: Number(createForm.can_see_price_gbp),
      });

      setCreateForm({
        user_email: "",
        name: "",
        role: "customer",
        active: "1",
        can_see_price_gbp: "0",
      });

      await loadUsers();
    } catch (e2) {
      setError(e2?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(user_email, patch) {
    if (!email) return;
    setSaving(true);
    setError("");
    try {
      await UK_API.userUpdate(email, { user_email, ...patch });
      await loadUsers();
    } catch (e) {
      setError(e?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user_email) {
    if (!email) return;

    setSaving(true);
    setError("");
    try {
      await UK_API.userDelete(email, user_email);
      await loadUsers();
    } catch (e) {
      setError(e?.message || "Failed to delete user");
    } finally {
      setSaving(false);
    }
  }

  function openDelete(emailToDelete) {
    setDeleteTargetEmail(String(emailToDelete || ""));
    setDeleteOpen(true);
  }

  function openEditName(targetEmail, currentName) {
    setNameTargetEmail(String(targetEmail || ""));
    setNameDraft(String(currentName || ""));
    setNameDialogOpen(true);
  }

  async function confirmEditName() {
    if (!nameTargetEmail) return;
    await handleUpdate(nameTargetEmail, { name: nameDraft });
    if (!saving) setNameDialogOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Admin Users</h1>
          <p className="text-sm text-muted-foreground">Create, update status, and manage roles.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Add User</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreate}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                  <Input
                    value={createForm.user_email}
                    onChange={(e) => setCreateForm((s) => ({ ...s, user_email: e.target.value }))}
                    placeholder="user@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
                  <Select value={createForm.role} onValueChange={(v) => setCreateForm((s) => ({ ...s, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">customer</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Active</label>
                    <Select value={createForm.active} onValueChange={(v) => setCreateForm((s) => ({ ...s, active: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="0">0</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Can See Pound Price</label>
                    <Select
                      value={createForm.can_see_price_gbp}
                      onValueChange={(v) => setCreateForm((s) => ({ ...s, can_see_price_gbp: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="0">0</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button disabled={saving} type="submit" className="w-full">
                  {saving ? "Saving..." : "Add User"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Users ({filtered.length})</CardTitle>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by email, name, role..."
                  className="sm:max-w-xs"
                />
              </div>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {loading ? (
                <UsersSkeleton />
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">No users found.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((u) => (
                    <div key={u.email} className="rounded-xl border p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">{u.email}</div>
                          <div className="text-sm text-muted-foreground">{u.name || "—"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{u.role}</Badge>
                          <Badge variant={Number(u.active) === 1 ? "default" : "outline"}>
                            active:{Number(u.active) === 1 ? "1" : "0"}
                          </Badge>
                          <Badge variant="outline">pound price:{Number(u.can_see_price_gbp) === 1 ? "1" : "0"}</Badge>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
                        <Select
                          value={String(u.role || "customer")}
                          onValueChange={(v) => handleUpdate(u.email, { role: v })}
                          disabled={saving}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="customer">customer</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={String(Number(u.active) === 1 ? "1" : "0")}
                          onValueChange={(v) => handleUpdate(u.email, { active: Number(v) })}
                          disabled={saving}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">active=1</SelectItem>
                            <SelectItem value="0">active=0</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={String(Number(u.can_see_price_gbp) === 1 ? "1" : "0")}
                          onValueChange={(v) => handleUpdate(u.email, { can_see_price_gbp: Number(v) })}
                          disabled={saving}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">can see pound=1</SelectItem>
                            <SelectItem value="0">can see pound=0</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline"
                          disabled={saving}
                          onClick={() => openEditName(u.email, u.name)}
                        >
                          Edit Name
                        </Button>

                        <Button
                          variant="destructive"
                          disabled={saving}
                          onClick={() => openDelete(u.email)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        loading={saving}
        title="Delete user"
        description={
          deleteTargetEmail
            ? `Delete user "${deleteTargetEmail}"?`
            : "Delete this user?"
        }
        confirmText="Delete"
        onClose={() => {
          if (!saving) setDeleteOpen(false);
        }}
        onConfirm={() => handleDelete(deleteTargetEmail)}
      />

      <Dialog
        open={nameDialogOpen}
        onOpenChange={(next) => {
          if (!saving) setNameDialogOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user name</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{nameTargetEmail}</div>
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Full name"
              disabled={saving}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmEditName} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

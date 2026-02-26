import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import {
  createUser,
  listUsers,
  removeUser,
  updateUser,
} from "@/firebase/users";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDeleteDialog from "@/components/common/ConfirmDeleteDialog";
import { Trash2 } from "lucide-react";

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
  const currentEmail = String(user?.email || "").toLowerCase();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetEmail, setDeleteTargetEmail] = useState("");

  const [createForm, setCreateForm] = useState({
    user_email: "",
    name: "",
    role: "customer",
    active: "1",
    can_see_price_gbp: "0",
    can_use_cart: "1",
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: listUsers,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 0,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (_data, vars) => {
      const row = {
        email: String(vars?.user_email || vars?.email || "").toLowerCase(),
        name: String(vars?.name || "").trim(),
        role: String(vars?.role || "customer").toLowerCase(),
        active: Number(vars?.active) === 1 ? 1 : 0,
        can_see_price_gbp: Number(vars?.can_see_price_gbp) === 1 ? 1 : 0,
        can_use_cart: Number(vars?.can_use_cart) === 1 ? 1 : 0,
      };
      qc.setQueryData(queryKeys.users.list(), (old) => {
        const list = Array.isArray(old) ? old : [];
        const without = list.filter((u) => String(u?.email || "").toLowerCase() !== row.email);
        return [...without, row].sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ email, patch }) => updateUser(email, patch),
    onSuccess: async (_data, vars) => {
      const target = String(vars?.email || "").toLowerCase();
      qc.setQueryData(queryKeys.users.list(), (old) => {
        const list = Array.isArray(old) ? old : [];
        return list.map((u) => {
          if (String(u?.email || "").toLowerCase() !== target) return u;
          return { ...u, ...vars.patch };
        });
      });
      await qc.invalidateQueries({
        queryKey: queryKeys.users.detail(target),
      });
      if (String(vars?.email || "").toLowerCase() === currentEmail) {
        await qc.invalidateQueries({ queryKey: queryKeys.auth.me() });
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeUser,
    onSuccess: async (data, email) => {
      const target = String(email || "").toLowerCase();
      qc.setQueryData(queryKeys.users.list(), (old) => {
        const list = Array.isArray(old) ? old : [];
        return list.filter((u) => String(u?.email || "").toLowerCase() !== target);
      });
      await qc.invalidateQueries({
        queryKey: queryKeys.users.detail(email || ""),
      });
      if (String(email || "").toLowerCase() === currentEmail) {
        await qc.invalidateQueries({ queryKey: queryKeys.auth.me() });
      }
      return data;
    },
  });

  const filtered = useMemo(() => {
    const users = usersQuery.data || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const a = String(u.email || "").toLowerCase();
      const b = String(u.name || "").toLowerCase();
      const c = String(u.role || "").toLowerCase();
      return a.includes(needle) || b.includes(needle) || c.includes(needle);
    });
  }, [usersQuery.data, q]);

  async function handleCreate(e) {
    e.preventDefault();
    setMutationError("");
    try {
      await createMutation.mutateAsync({
        user_email: createForm.user_email,
        name: createForm.name,
        role: createForm.role,
        active: Number(createForm.active),
        can_see_price_gbp: Number(createForm.can_see_price_gbp),
        can_use_cart: Number(createForm.can_use_cart),
      });

      setCreateForm({
        user_email: "",
        name: "",
        role: "customer",
        active: "1",
        can_see_price_gbp: "0",
        can_use_cart: "1",
      });
    } catch (e2) {
      setMutationError(e2?.message || "Failed to create user");
    }
  }

  async function handleUpdate(userEmail, patch) {
    setMutationError("");
    try {
      await updateMutation.mutateAsync({ email: userEmail, patch });
    } catch (e) {
      setMutationError(e?.message || "Failed to update user");
    }
  }

  async function handleDelete(userEmail) {
    setMutationError("");
    try {
      await removeMutation.mutateAsync(userEmail);
    } catch (e) {
      setMutationError(e?.message || "Failed to delete user");
    }
  }

  function openDelete(emailToDelete) {
    setDeleteTargetEmail(String(emailToDelete || ""));
    setDeleteOpen(true);
  }

  const loading = usersQuery.isLoading;
  const error = mutationError || usersQuery.error?.message || "";
  const saving = createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Admin Users</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Add User</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreate}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Email
                  </label>
                  <Input
                    value={createForm.user_email}
                    onChange={(e) =>
                      setCreateForm((s) => ({
                        ...s,
                        user_email: e.target.value,
                      }))
                    }
                    placeholder="user@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Name
                  </label>
                  <Input
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((s) => ({ ...s, name: e.target.value }))
                    }
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Role
                  </label>
                  <Select
                    value={createForm.role}
                    onValueChange={(v) =>
                      setCreateForm((s) => ({ ...s, role: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">customer</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col">
                    <label className="mb-1 block min-h-8 text-xs font-medium text-muted-foreground">
                      Active
                    </label>
                    <Select
                      value={createForm.active}
                      onValueChange={(v) =>
                        setCreateForm((s) => ({ ...s, active: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="0">0</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <label className="mb-1 block min-h-8 text-xs font-medium text-muted-foreground">
                      Can See Pound Price
                    </label>
                    <Select
                      value={createForm.can_see_price_gbp}
                      onValueChange={(v) =>
                        setCreateForm((s) => ({ ...s, can_see_price_gbp: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="0">0</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <label className="mb-1 block min-h-8 text-xs font-medium text-muted-foreground">
                      Can Use Cart
                    </label>
                    <Select
                      value={createForm.can_use_cart}
                      onValueChange={(v) =>
                        setCreateForm((s) => ({ ...s, can_use_cart: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                <CardTitle className="text-base">
                  Users ({filtered.length})
                </CardTitle>
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
                <div className="text-sm text-muted-foreground">
                  No users found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((u) => {
                    const isSelf =
                      String(u.email || "").toLowerCase() === currentEmail;
                    return (
                      <div key={u.email} className="rounded-xl border p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium">{u.email}</div>
                            <div className="text-sm text-muted-foreground">
                              {u.name || "—"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{u.role}</Badge>
                            <Badge
                              variant={
                                Number(u.active) === 1 ? "default" : "outline"
                              }
                            >
                              active:{Number(u.active) === 1 ? "1" : "0"}
                            </Badge>
                            <Badge variant="outline">
                              pound price:
                              {Number(u.can_see_price_gbp) === 1 ? "1" : "0"}
                            </Badge>
                            <Badge variant="outline">
                              cart:{Number(u.can_use_cart) === 1 ? "1" : "0"}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-6">
                          <Select
                            value={String(u.role || "customer")}
                            onValueChange={(v) =>
                              handleUpdate(u.email, { role: v })
                            }
                            disabled={saving || isSelf}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="customer">customer</SelectItem>
                              <SelectItem value="admin">admin</SelectItem>
                            </SelectContent>
                          </Select>

                          <Select
                            value={String(Number(u.active) === 1 ? "1" : "0")}
                            onValueChange={(v) =>
                              handleUpdate(u.email, { active: Number(v) })
                            }
                            disabled={saving || isSelf}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">active=1</SelectItem>
                              <SelectItem value="0">active=0</SelectItem>
                            </SelectContent>
                          </Select>

                          <Select
                            value={String(
                              Number(u.can_see_price_gbp) === 1 ? "1" : "0",
                            )}
                            onValueChange={(v) =>
                              handleUpdate(u.email, {
                                can_see_price_gbp: Number(v),
                              })
                            }
                            disabled={saving}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">price=1</SelectItem>
                              <SelectItem value="0">price=0</SelectItem>
                            </SelectContent>
                          </Select>

                          <Select
                            value={String(
                              Number(u.can_use_cart) === 1 ? "1" : "0",
                            )}
                            onValueChange={(v) =>
                              handleUpdate(u.email, { can_use_cart: Number(v) })
                            }
                            disabled={saving}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">cart=1</SelectItem>
                              <SelectItem value="0">cart=0</SelectItem>
                            </SelectContent>
                          </Select>

                          <Input
                            defaultValue={u.name || ""}
                            onBlur={(e) => {
                              const next = String(e.target.value || "").trim();
                              if (next !== String(u.name || "").trim()) {
                                handleUpdate(u.email, { name: next });
                              }
                            }}
                            disabled={saving}
                            placeholder="Name"
                          />

                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => openDelete(u.email)}
                            disabled={saving || isSelf}
                            title="Delete user"
                            aria-label="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete user?"
        description={`This will permanently delete ${deleteTargetEmail}.`}
        confirmText={<Trash2 className="h-4 w-4" />}
        loading={saving}
        onConfirm={async () => {
          await handleDelete(deleteTargetEmail);
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}

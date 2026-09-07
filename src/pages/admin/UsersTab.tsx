import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminUser = {
  user_id: string;
  email: string | null;
  is_paid: boolean;
  sub_status: string | null;
  plan: string | null;
  price_id: string | null;
  renewal_date: string | null;
  cancel_at_period_end: boolean | null;
  used_credits: number | null;
  total_credits: number | null;
  stripe_customer_id: string | null;
  joined_at: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const UsersTab = () => {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) setError(error.message);
      else setRows((data as AdminUser[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading users…</p>;
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{rows.length} users</p>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Renewal</TableHead>
              <TableHead>Stripe Customer</TableHead>
              <TableHead>User ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_paid
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {u.is_paid ? "Paid" : "Free"}
                  </span>
                  {u.sub_status && u.sub_status !== "active" && (
                    <span className="ml-1 text-xs text-muted-foreground">({u.sub_status})</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{u.plan ?? "—"}</TableCell>
                <TableCell className="text-sm">{fmtDate(u.joined_at)}</TableCell>
                <TableCell className="text-sm">
                  {u.used_credits ?? 0}/{u.total_credits ?? 0}
                </TableCell>
                <TableCell className="text-sm">
                  {fmtDate(u.renewal_date)}
                  {u.cancel_at_period_end && (
                    <span className="ml-1 text-xs text-amber-600">(cancelling)</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{u.stripe_customer_id ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{u.user_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UsersTab;

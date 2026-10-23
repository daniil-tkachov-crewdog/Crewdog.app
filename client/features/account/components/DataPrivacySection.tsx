import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function DataPrivacySection() {
  const handleExport = () =>
    toast.success("Your data export has been initiated. Check your email!");
  const handleDelete = () =>
    toast.error(
      "Account deletion initiated. You'll receive a confirmation email."
    );

  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold">Data & Privacy</h2>
      </div>

      <Card className="p-6 glass-card space-y-4">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleExport}
        >
          <Download className="mr-2 h-4 w-4" />
          Export My Data
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Account
        </Button>
      </Card>
    </section>
  );
}

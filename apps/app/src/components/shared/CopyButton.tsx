import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends Omit<React.ComponentProps<typeof Button>, "onClick"> {
  text: string;
  label?: string;
}

export function CopyButton({ text, label, className, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => void handleCopy()}
      {...props}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label ?? (copied ? "Copied!" : "Copy")}
    </Button>
  );
}

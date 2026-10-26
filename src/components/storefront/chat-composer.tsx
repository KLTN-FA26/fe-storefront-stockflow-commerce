"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
  placeholder?: string;
  onSend: (message: string) => void;
}

export function ChatComposer({ placeholder = "Nhập tin nhắn...", onSend }: ChatComposerProps) {
  const [message, setMessage] = useState("");
  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessage("");
  };

  return (
    <div className="flex items-end gap-2 rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-2 shadow-[var(--card-shadow)] focus-within:border-border-strong">
      <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={placeholder} className="min-h-11 resize-none border-0 shadow-none" />
      <Button type="button" size="icon" className="size-11 shrink-0 rounded-full" onClick={submit} disabled={!message.trim()}><Send className="h-4 w-4" /></Button>
    </div>
  );
}

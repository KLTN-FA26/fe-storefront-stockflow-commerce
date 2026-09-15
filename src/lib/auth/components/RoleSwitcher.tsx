"use client";

import { useIsMock } from "@/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

import { useAuthStore } from "../auth-store";
import { ROLES, type RoleName } from "../roles";

const ROLE_LABELS: Record<RoleName, string> = {
  "System Admin": "System Admin",
  "Procurement Staff": "Procurement Staff",
  "Warehouse Staff": "Warehouse Staff",
  "Warehouse Manager": "Warehouse Manager",
  "Inventory Planner": "Inventory Planner",
  "QC Staff": "QC Staff",
  Accountant: "Accountant",
  "E-commerce Admin": "E-commerce Admin",
  "Sales Staff": "Sales Staff",
  "Order Coordinator": "Order Coordinator",
};

export function RoleSwitcher() {
  const isMock = useIsMock();
  const user = useAuthStore((state) => state.user);
  const impersonatedRole = useAuthStore((state) => state.impersonatedRole);
  const setImpersonatedRole = useAuthStore((state) => state.setImpersonatedRole);
  const effectiveRoles = useAuthStore((state) => state.effectiveRoles);

  if (!isMock || !user) return null;

  const currentRoles = effectiveRoles();
  const currentLabel = impersonatedRole ? ROLE_LABELS[impersonatedRole] : user.roles.join(", ");

  return (
    <div className="fixed right-4 bottom-4 z-50">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="border-border-default bg-bg-surface text-ink-primary shadow-lg hover:bg-bg-subtle" title="Role Switcher (Dev Mode)">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" />
            <span className="max-w-[200px] truncate">{impersonatedRole ? `Mock: ${currentLabel}` : currentLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 border-border-default bg-bg-surface p-2 text-ink-primary shadow-lg" align="end">
          <div className="px-2 py-2">
            <p className="text-xs font-semibold">Role Switcher</p>
            <p className="text-[10px] text-ink-tertiary">Đang đăng nhập: {user.fullName}</p>
            <p className="text-[10px] text-ink-tertiary">Roles gốc: {user.roles.join(", ")}</p>
          </div>
          <Separator className="my-1 bg-border-default" />
          <Command className="bg-bg-surface text-ink-primary">
            <CommandList>
              <CommandGroup>
                <CommandItem
                  value="original-roles"
                  data-checked={!impersonatedRole}
                  className="text-ink-primary data-selected:bg-bg-muted data-selected:text-ink-primary"
                  onSelect={() => setImpersonatedRole(null)}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                  Roles gốc ({user.roles.join(", ")})
                </CommandItem>
                {ROLES.map((role) => (
                  <CommandItem
                    key={role}
                    value={role}
                    data-checked={impersonatedRole === role}
                    className="text-ink-primary data-selected:bg-bg-muted data-selected:text-ink-primary"
                    onSelect={() => setImpersonatedRole(role)}
                  >
                    <span className={currentRoles.includes(role) ? "h-1.5 w-1.5 rounded-full bg-accent" : "h-1.5 w-1.5 rounded-full bg-border-default"} />
                    {ROLE_LABELS[role]}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

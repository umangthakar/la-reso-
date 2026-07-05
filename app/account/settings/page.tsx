"use client";

import { Settings } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function SettingsPage() {
  return (
    <AccountSubPage
      title="Settings"
      icon={Settings}
      headline="Coming Soon"
      sub="Profile and notification settings are being baked — check back soon."
    />
  );
}

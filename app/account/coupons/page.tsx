"use client";

import { Gift } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function CouponsPage() {
  return (
    <AccountSubPage
      title="Coupons"
      icon={Gift}
      headline="Coming Soon"
      sub="Your discount codes and sweet offers will live here — check back soon."
    />
  );
}

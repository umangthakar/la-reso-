"use client";

import { Package } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function OrdersPage() {
  return (
    <AccountSubPage
      title="My Orders"
      icon={Package}
      headline="No orders yet"
      sub="When you place an order, it'll show up here so you can track it."
    />
  );
}

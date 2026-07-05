"use client";

import { CreditCard } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function PaymentsPage() {
  return (
    <AccountSubPage
      title="Payments"
      icon={CreditCard}
      headline="Coming Soon"
      sub="Manage your cards and payment methods here — check back soon."
    />
  );
}

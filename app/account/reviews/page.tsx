"use client";

import { Star } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function ReviewsPage() {
  return (
    <AccountSubPage
      title="Reviews"
      icon={Star}
      headline="Coming Soon"
      sub="Reviews you leave on your favourite bakes will appear here soon."
    />
  );
}

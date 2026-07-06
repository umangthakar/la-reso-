"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

/**
 * Fixed WhatsApp button, bottom-right, with a gentle pulse + bounce.
 * Number comes solely from the DB (contact.whatsapp) — hidden when unset.
 */
export function WhatsappFloat({ number }: { number: string }) {
  const digits = number.replace(/[^0-9]/g, "");
  if (!digits) return null;

  return (
    <motion.a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_rgba(37,211,102,0.5)]"
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Pulsing ring */}
      <motion.span
        className="absolute inset-0 rounded-full bg-[#25D366]"
        animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      />
      <MessageCircle className="relative h-7 w-7" />
    </motion.a>
  );
}

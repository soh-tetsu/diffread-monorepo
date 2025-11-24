"use client";

import { ChakraProvider } from "@chakra-ui/react";
import system from "@/theme";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      {children}
      <Toaster />
    </ChakraProvider>
  );
}

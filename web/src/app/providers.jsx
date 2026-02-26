import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/app/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { CartProvider } from "@/cart/CartProvider";

export function AppProviders({ children }) {
  const isDev = import.meta.env.DEV;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
      {isDev ? <ReactQueryDevtools initialIsOpen={false} position="bottom" /> : null}
    </QueryClientProvider>
  );
}

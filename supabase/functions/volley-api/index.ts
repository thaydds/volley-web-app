import { createHandler } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(
  createHandler({
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    supabaseKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    allowedOrigin: Deno.env.get('VOLLEY_ALLOWED_ORIGIN') ?? '',
  })
);

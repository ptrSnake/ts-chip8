import { serveDir } from "jsr:@std/http/file-server";

Deno.serve({ port: 8080 }, (req) =>
  serveDir(req, { fsRoot: ".", quiet: true })
);

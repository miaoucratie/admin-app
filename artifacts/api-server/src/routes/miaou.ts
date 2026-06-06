import { Router, type IRouter, type Request, type Response } from "express";

const UPSTREAM_BASE =
  "https://miaoucratie-reservation-api.miaoucratie.workers.dev";

const ALLOWED_ORIGIN = "https://miaoucratie.fr";

const router: IRouter = Router();

async function proxy(
  req: Request,
  res: Response,
  upstreamPath: string,
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: ALLOWED_ORIGIN,
    Referer: `${ALLOWED_ORIGIN}/`,
  };

  const auth = req.header("authorization");
  if (auth) {
    headers.Authorization = auth;
  }

  const method = req.method.toUpperCase();
  let body: string | undefined;
  if (method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body ?? {});
  }

  try {
    const upstream = await fetch(`${UPSTREAM_BASE}${upstreamPath}`, {
      method,
      headers,
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.set("Content-Type", "application/json");
    res.send(text || "{}");
  } catch (err) {
    req.log.error({ err }, "Miaoucratie upstream request failed");
    res
      .status(502)
      .json({ message: "Service de réservation injoignable. Réessayez." });
  }
}

router.post("/miaou/login", (req, res) => proxy(req, res, "/admin/login"));

router.get("/miaou/unavailabilities", (req, res) =>
  proxy(req, res, "/admin/unavailabilities"),
);

router.post("/miaou/unavailabilities", (req, res) =>
  proxy(req, res, "/admin/unavailabilities"),
);

router.put("/miaou/unavailabilities/:id", (req, res) =>
  proxy(req, res, `/admin/unavailabilities/${req.params.id}`),
);

router.delete("/miaou/unavailabilities/:id", (req, res) =>
  proxy(req, res, `/admin/unavailabilities/${req.params.id}`),
);

export default router;

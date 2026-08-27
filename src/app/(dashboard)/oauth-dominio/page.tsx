"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Globe, Loader2, Trash2, Zap } from "lucide-react";
import api from "@/lib/api";

/**
 * Phase 12 — Superadmin UI to configure a white-label CNAME for the OAuth proxy.
 *
 * The admin types e.g. "oauth.empresa.com", clicks "Validate CNAME", then "Save".
 * Our backend runs local DNS lookups, then hits the proxy /api/register-oauth-domain
 * which re-validates license + CNAME before adding to its registry.
 *
 * Once saved, all OAuth flows in this tenant use the custom domain as the
 * redirect URI that users will see in the provider's authorization dialog.
 */

interface ValidationResult {
  customDomain: string;
  cnameOk: boolean;
  target: string | null;
  reason: string | null;
  expected: string;
}

// Canonical proxy secret expected for this installation, served at runtime
// from /oauth-proxy-config.json (in frontend/public/). No rebuild needed to
// change it. If the config file is missing or unreadable, we fall back to the
// hardcoded value below so the check still works on a fresh install.
const PROXY_CONFIG_URL = "/oauth-proxy-config.json";
const FALLBACK_EXPECTED_PROXY_SECRET =
  "2f5b5b457e2febbc3c2333e2ebc84df926a45c36f76f3bedc0d1994f749413f1";

function maskSecret(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

export default function OAuthDominioPage() {
  const t = useTranslations("oauthCustomDomainPage");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [domain, setDomain] = useState("");
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);
  const [proxyHostname, setProxyHostname] = useState<string>("cname.techprovider.com.br");
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Phase 11 — Proxy secret (shared across all tenants of this installation)
  const [proxySecret, setProxySecret] = useState("");
  const [proxySecretSet, setProxySecretSet] = useState(false);
  const [proxySecretPreview, setProxySecretPreview] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [proxySecretMatchesExpected, setProxySecretMatchesExpected] = useState(true);
  const [expectedProxySecretPreview, setExpectedProxySecretPreview] = useState("");
  const [resettingSecret, setResettingSecret] = useState(false);
  const [expectedSecret, setExpectedSecret] = useState<string>("");

  // Phase 12 — Health check (proxy + license + cname)
  interface HealthResult {
    proxyReachable: boolean;
    proxyUptimeSec?: number;
    licenseValid: boolean;
    licenseError?: string;
    customDomain: string | null;
    cnameOk?: boolean;
    cnameReason?: string | null;
  }
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  async function handleHealthCheck() {
    setCheckingHealth(true);
    setHealth(null);
    try {
      const { data } = await api.get<HealthResult>("/admin/oauth-custom-domain/health");
      setHealth(data);
      if (data.proxyReachable && data.licenseValid && (data.cnameOk !== false)) {
        toast.success(t("healthOk"));
      } else {
        toast.error(t("healthFailed"));
      }
    } catch {
      toast.error(t("errorHealth"));
    } finally {
      setCheckingHealth(false);
    }
  }

  async function loadExpectedSecret(): Promise<string> {
    try {
      const resp = await fetch(PROXY_CONFIG_URL, { cache: "no-store" });
      if (!resp.ok) return FALLBACK_EXPECTED_PROXY_SECRET;
      const cfg = (await resp.json()) as { expectedSecret?: string };
      const value = (cfg?.expectedSecret || "").trim();
      return value || FALLBACK_EXPECTED_PROXY_SECRET;
    } catch {
      return FALLBACK_EXPECTED_PROXY_SECRET;
    }
  }

  async function loadStatus(expected: string): Promise<{ proxySecretSet: boolean; matches: boolean } | null> {
    try {
      const { data } = await api.get<{
        customDomain: string | null;
        proxyHostname: string;
        proxySecretSet: boolean;
        proxySecretPreview: string;
      }>("/admin/oauth-custom-domain");
      setCurrentDomain(data?.customDomain || null);
      setDomain(data?.customDomain || "");
      if (data?.proxyHostname) setProxyHostname(data.proxyHostname);
      setProxySecretSet(!!data?.proxySecretSet);
      setProxySecretPreview(data?.proxySecretPreview || "");

      // Compare current preview to the expected secret's preview.
      // If expected is empty (config missing/empty), the check is disabled.
      const expectedPreview = maskSecret(expected);
      setExpectedProxySecretPreview(expectedPreview);
      const matches =
        !expected || (data?.proxySecretPreview || "") === expectedPreview;
      setProxySecretMatchesExpected(matches);

      return { proxySecretSet: !!data?.proxySecretSet, matches };
    } catch {
      toast.error(t("errorLoad"));
      return null;
    } finally {
      setLoading(false);
    }
  }

  function promptResetIfMismatch() {
    toast.warning(t("secretMismatchConfirm"), {
      duration: Infinity,
      action: {
        label: t("secretMismatchActionLabel"),
        onClick: () => {
          void handleResetSecret();
        },
      },
      cancel: {
        label: t("secretMismatchCancelLabel"),
        onClick: () => {
          toast.message(t("secretMismatchKept"));
        },
      },
    });
  }

  async function handleResetSecret() {
    if (!expectedSecret) return;
    setResettingSecret(true);
    try {
      const { data } = await api.put<{
        ok: boolean;
        proxySecretSet: boolean;
        proxySecretPreview: string;
        affected: number;
      }>("/admin/oauth-custom-domain/secret", {
        proxySecret: expectedSecret,
      });
      if (data?.ok) {
        setProxySecretSet(true);
        setProxySecretPreview(data.proxySecretPreview);
        setProxySecretMatchesExpected(true);
        toast.success(t("secretResetSuccess", { affected: data.affected }));
      }
    } catch {
      toast.error(t("errorResetSecret"));
    } finally {
      setResettingSecret(false);
    }
  }

  async function handleSaveSecret() {
    // Falls back to the canonical secret loaded from /oauth-proxy-config.json
    // when the input is empty — lets the superadmin click "Salvar Secret"
    // without re-typing the 64-char canonical value.
    const typed = proxySecret.trim();
    const value = typed || expectedSecret;
    if (!value) {
      toast.warning(t("enterSecret"));
      return;
    }
    if (value.length < 32) {
      toast.error(t("secretTooShort"));
      return;
    }
    setSavingSecret(true);
    try {
      const { data } = await api.put<{
        ok: boolean;
        proxySecretSet: boolean;
        proxySecretPreview: string;
        affected: number;
      }>("/admin/oauth-custom-domain/secret", { proxySecret: value });
      if (data?.ok) {
        setProxySecretSet(true);
        setProxySecretPreview(data.proxySecretPreview);
        setProxySecret("");
        toast.success(t("secretSaveSuccess", { affected: data.affected }));

        // If the saved value diverges from the canonical expected secret,
        // fire the same warning toast so the superadmin can choose to reset.
        if (expectedSecret) {
          const expectedPreview = maskSecret(expectedSecret);
          const matches = data.proxySecretPreview === expectedPreview;
          setProxySecretMatchesExpected(matches);
          if (!matches) {
            promptResetIfMismatch();
          }
        }
      }
    } catch (err: any) {
      toast.error(t("errorSaveSecret"));
    } finally {
      setSavingSecret(false);
    }
  }

  useEffect(() => {
    (async () => {
      const expected = await loadExpectedSecret();
      setExpectedSecret(expected);
      const status = await loadStatus(expected);
      // If the expected secret is configured (config file) and the stored
      // value diverges, ask the superadmin whether to reset.
      if (status && expected && !status.matches) {
        promptResetIfMismatch();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleValidate() {
    if (!domain.trim()) {
      toast.warning(t("enterDomain"));
      return;
    }
    setValidating(true);
    setValidation(null);
    try {
      const { data } = await api.post<ValidationResult>(
        "/admin/oauth-custom-domain/validate",
        { customDomain: domain.trim() }
      );
      setValidation(data);
      if (data.cnameOk) {
        toast.success(t("validateSuccess"));
      } else {
        toast.error(t("validateError"));
      }
    } catch {
      toast.error(t("errorValidate"));
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    if (!domain.trim()) {
      toast.warning(t("enterDomain"));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put<{ ok: boolean; customDomain: string }>(
        "/admin/oauth-custom-domain",
        { customDomain: domain.trim() }
      );
      if (data?.ok) {
        setCurrentDomain(data.customDomain);
        toast.success(t("saveSuccess"));
        // Dispara health check automaticamente apos salvar
        handleHealthCheck();
      } else {
        toast.error(t("errorSave"));
      }
    } catch (err: any) {
      const code = err?.response?.data?.error || "";
      if (code === "CNAME_NOT_POINTING_TO_PROXY") {
        toast.error(t("errorCnameMismatch"));
      } else {
        toast.error(t("errorSave"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm(t("removeConfirm"))) return;
    setSaving(true);
    try {
      await api.delete("/admin/oauth-custom-domain");
      setCurrentDomain(null);
      setDomain("");
      setValidation(null);
      toast.success(t("removeSuccess"));
    } catch {
      toast.error(t("errorRemove"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            {
              title: t("howItWorksTitle"),
              items: [
                t("howItWorks1", { hostname: proxyHostname }),
                t("howItWorks2"),
                t("howItWorks3"),
              ],
            },
          ],
        }}
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {currentDomain && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="font-medium">{t("currentLabel")}</div>
                    <div className="font-mono text-xs mt-1 break-all">{currentDomain}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleRemove} disabled={saving} title={t("remove")} className="shrink-0">
                    <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">{t("remove")}</span>
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("domainLabel")}</Label>
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="oauth.minhaempresa.com"
                  className="font-mono w-full"
                  disabled={saving}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving || validating || !domain.trim()}
                    className="flex-1 sm:flex-none"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("save")
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleValidate}
                    disabled={validating || saving || !domain.trim()}
                    className="flex-1 sm:flex-none"
                  >
                    {validating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-1.5" />
                        {t("validate")}
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground break-words">
                  {t("cnameInstruction", { hostname: proxyHostname })}
                </p>
              </div>

              {validation && (
                <div
                  className={`rounded-md border p-3 flex items-start gap-3 ${
                    validation.cnameOk
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  {validation.cnameOk ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    {validation.cnameOk ? (
                      <>
                        <div className="font-medium break-words">{t("validationOk")}</div>
                        <div className="text-xs text-muted-foreground mt-1 break-all">
                          {t("validationOkDetail", { target: validation.target || "—" })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium break-words">{t("validationError")}</div>
                        <div className="text-xs text-muted-foreground mt-1 break-words">
                          {t("validationErrorDetail", {
                            reason: validation.reason || "UNKNOWN",
                            expected: validation.expected,
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Zap className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">{t("secretSectionTitle")}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("secretSectionDesc")}</p>
            </div>
          </div>

          {proxySecretSet && proxySecretMatchesExpected && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium">{t("secretCurrentLabel")}</div>
                <div className="font-mono text-xs mt-1 text-muted-foreground break-all">{proxySecretPreview}</div>
              </div>
            </div>
          )}

          {expectedSecret && !proxySecretMatchesExpected && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-medium break-words">{t("secretMismatchTitle")}</div>
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    {t("secretMismatchDesc", {
                      current: proxySecretPreview || "—",
                      expected: expectedProxySecretPreview || "—",
                    })}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResetSecret()}
                disabled={resettingSecret}
                className="w-full sm:w-auto shrink-0"
              >
                {resettingSecret ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("secretResetBtn")
                )}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("secretLabel")}</Label>
            <Input
              type="password"
              value={proxySecret}
              onChange={(e) => setProxySecret(e.target.value)}
              placeholder={t("secretPlaceholder")}
              className="font-mono w-full"
              disabled={savingSecret}
            />
            <Button
              onClick={handleSaveSecret}
              disabled={
                savingSecret ||
                (proxySecret.trim()
                  ? proxySecret.trim().length < 32
                  : !expectedSecret)
              }
              className="w-full sm:w-auto"
            >
              {savingSecret ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("saveSecret")
              )}
            </Button>
            <p className="text-xs text-muted-foreground break-words">{t("secretHint")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Phase 12 — Health check card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-sm min-w-0">
                <div className="font-medium break-words">{t("healthSectionTitle")}</div>
                <p className="text-xs text-muted-foreground mt-1 break-words">{t("healthSectionDesc")}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleHealthCheck} disabled={checkingHealth} className="w-full sm:w-auto shrink-0">
              {checkingHealth ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-1.5" />
                  {t("healthRunBtn")}
                </>
              )}
            </Button>
          </div>

          {health && (
            <div className="space-y-2 border-t pt-3">
              {/* Proxy reachability */}
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                health.proxyReachable
                  ? "bg-emerald-500/5 border border-emerald-500/30"
                  : "bg-red-500/5 border border-red-500/30"
              }`}>
                {health.proxyReachable ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="font-medium">
                  {t("healthProxyLabel")}:
                </span>
                <span>
                  {health.proxyReachable
                    ? `${t("healthOkLabel")}${typeof health.proxyUptimeSec === "number" ? ` (${t("healthUptimeLabel")}: ${Math.floor(health.proxyUptimeSec / 60)}min)` : ""}`
                    : t("healthUnreachableLabel")}
                </span>
              </div>

              {/* License validity */}
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                health.licenseValid
                  ? "bg-emerald-500/5 border border-emerald-500/30"
                  : "bg-red-500/5 border border-red-500/30"
              }`}>
                {health.licenseValid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="font-medium">{t("healthLicenseLabel")}:</span>
                <span>
                  {health.licenseValid
                    ? t("healthLicenseValidLabel")
                    : (health.licenseError || t("healthLicenseInvalidLabel"))}
                </span>
              </div>

              {/* Custom domain (if configured) */}
              {health.customDomain && (
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                  health.cnameOk
                    ? "bg-emerald-500/5 border border-emerald-500/30"
                    : "bg-red-500/5 border border-red-500/30"
                }`}>
                  {health.cnameOk ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium">{t("healthCnameLabel")}:</span>
                  <span className="font-mono">{health.customDomain}</span>
                  <span>
                    {health.cnameOk
                      ? t("healthOkLabel")
                      : (health.cnameReason || t("healthCnameBrokenLabel"))}
                  </span>
                </div>
              )}
              {!health.customDomain && (
                <p className="text-xs text-muted-foreground italic">{t("healthNoCustomDomain")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 space-y-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-medium">{t("warningTitle")}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("warning1")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("warning2")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("warning3")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { useSearchParams } from 'react-router-dom';
import { useWorkspaceEntitlement } from '../workspaces/entitlements/useWorkspaceEntitlement';
import { ENTITLEMENT_PLAN_LABELS } from '../workspaces/entitlements/entitlementTypes';
import { useWorkspace } from '../workspaces/useWorkspace';
import {
  createBillingPortalSession,
  createCheckoutSession,
  getWorkspaceBillingSummary,
  reconcileWorkspaceBilling,
  type WorkspaceBillingSummary,
} from './billingService';
import type { BillingInterval } from './billingTypes';

interface BillingLoadState {
  workspaceId: string | null;
  refreshVersion: number;
  summary: WorkspaceBillingSummary | null;
  error: string | null;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function BillingPage() {
  const { workspace } = useWorkspace();
  const {
    entitlement,
    loading: entitlementLoading,
    error: entitlementError,
    retry,
  } = useWorkspaceEntitlement();
  const [searchParams] = useSearchParams();
  const [billingState, setBillingState] = useState<BillingLoadState>({
    workspaceId: null,
    refreshVersion: -1,
    summary: null,
    error: null,
  });
  const [busy, setBusy] = useState<
    BillingInterval | 'portal' | 'reconcile' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [checkoutNoticeDismissed, setCheckoutNoticeDismissed] = useState(false);

  const refreshSummary = useCallback(() => {
    setRefreshVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!workspace?.id) return;
    let current = true;
    void getWorkspaceBillingSummary(workspace.id).then((result) => {
      if (!current) return;
      setBillingState(
        result.ok
          ? {
              workspaceId: workspace.id,
              refreshVersion,
              summary: result.value,
              error: null,
            }
          : {
              workspaceId: workspace.id,
              refreshVersion,
              summary: null,
              error: result.error.message,
            },
      );
    });
    return () => {
      current = false;
    };
  }, [workspace?.id, refreshVersion]);

  const checkoutState = searchParams.get('checkout');
  const summaryMatchesRequest =
    workspace?.id !== undefined &&
    billingState.workspaceId === workspace.id &&
    billingState.refreshVersion === refreshVersion;
  const summary = summaryMatchesRequest ? billingState.summary : null;
  const summaryLoading = !!workspace?.id && !summaryMatchesRequest;
  const summaryError = summaryMatchesRequest ? billingState.error : null;
  const showCheckoutNotice =
    checkoutState === 'success' && !checkoutNoticeDismissed;
  const plan = entitlement?.plan ?? null;
  const isStripePro = plan === 'pro' && entitlement?.source === 'stripe';
  const hasOpenStripeSubscription =
    summary?.subscriptionStatus !== null &&
    summary?.subscriptionStatus !== undefined &&
    ['active', 'past_due', 'incomplete', 'paused', 'trialing'].includes(
      summary.subscriptionStatus,
    );
  const canUpgrade =
    plan === 'teacher_free' &&
    summary?.canManageBilling === true &&
    !hasOpenStripeSubscription;
  const canManageStripe =
    (isStripePro || hasOpenStripeSubscription) &&
    summary?.canManageBilling === true;

  const startCheckout = async (interval: BillingInterval) => {
    if (!workspace?.id || busy) return;
    setBusy(interval);
    setActionError(null);
    const result = await createCheckoutSession(workspace.id, interval);
    if (result.ok) {
      window.location.assign(result.value);
    } else {
      setActionError(result.error.message);
      setBusy(null);
    }
  };

  const openPortal = async () => {
    if (!workspace?.id || busy) return;
    setBusy('portal');
    setActionError(null);
    const result = await createBillingPortalSession(workspace.id);
    if (result.ok) {
      window.location.assign(result.value);
    } else {
      setActionError(result.error.message);
      setBusy(null);
    }
  };

  const refreshPlanStatus = async () => {
    if (!workspace?.id || busy) return;
    setActionError(null);
    if (summary?.canManageBilling) {
      setBusy('reconcile');
      const result = await reconcileWorkspaceBilling(workspace.id);
      setBusy(null);
      if (!result.ok) {
        setActionError(result.error.message);
        return;
      }
    }
    retry();
    refreshSummary();
  };

  if (entitlementLoading || !entitlement) {
    return (
      <section
        className="workspace-content billing-page"
        aria-live="polite"
        role="status"
      >
        <h1>Billing</h1>
        <p className="muted-copy">
          {entitlementError?.message ?? 'Loading workspace plan…'}
        </p>
      </section>
    );
  }

  const periodEnd = formatDate(summary?.currentPeriodEnd ?? null);

  return (
    <section className="workspace-content billing-page">
      <header className="billing-page-header">
        <div>
          <p className="eyebrow">Workspace settings</p>
          <h1>Billing</h1>
          <p className="muted-copy">
            Plan and payment settings for {workspace?.name ?? 'this workspace'}.
          </p>
        </div>
      </header>

      {showCheckoutNotice && (
        <div className="notice billing-notice" role="status">
          <span>
            Payment received. Stripe is confirming the workspace plan; access
            changes only after confirmation.
          </span>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => void refreshPlanStatus()}
            disabled={busy !== null}
          >
            {busy === 'reconcile'
              ? 'Checking with Stripe…'
              : 'Check plan status'}
          </button>
          <button
            className="button button-quiet"
            type="button"
            aria-label="Dismiss payment notice"
            onClick={() => setCheckoutNoticeDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      )}
      {checkoutState === 'cancelled' && (
        <p className="muted-copy" role="status">
          Checkout was cancelled. Your current plan has not changed.
        </p>
      )}

      <article className="billing-plan-panel">
        <div className="billing-plan-heading">
          <div>
            <p className="eyebrow">Current plan</p>
            <h2>{ENTITLEMENT_PLAN_LABELS[entitlement.plan]}</h2>
          </div>
          {isStripePro && summary?.cancelAtPeriodEnd && periodEnd && (
            <p className="billing-renewal-note">
              Pro remains active until {periodEnd}.
            </p>
          )}
        </div>

        {summaryLoading ? (
          <LoadingState label="Loading billing details…" />
        ) : summaryError ? (
          <div className="billing-summary-error" role="alert">
            <p>{summaryError}</p>
            <button
              className="button button-quiet"
              type="button"
              onClick={refreshSummary}
            >
              Retry
            </button>
          </div>
        ) : null}

        {isStripePro || hasOpenStripeSubscription ? (
          <div className="billing-plan-details">
            {summary?.subscriptionStatus === 'past_due' && (
              <p className="billing-attention" role="status">
                Payment needs attention. Pro access has a limited grace period.
              </p>
            )}
            {!isStripePro && summary?.subscriptionStatus !== 'past_due' && (
              <p className="billing-attention" role="status">
                This workspace has a Stripe subscription that needs billing
                attention.
              </p>
            )}
            {isStripePro && summary?.billingInterval && (
              <p className="muted-copy">
                {summary.billingInterval === 'monthly'
                  ? '$19 monthly'
                  : '$149 annually'}
                {periodEnd &&
                  !summary.cancelAtPeriodEnd &&
                  ` · Current period ends ${periodEnd}`}
              </p>
            )}
            {canManageStripe ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void openPortal()}
                disabled={busy !== null}
              >
                {busy === 'portal' ? 'Opening billing…' : 'Manage billing'}
              </button>
            ) : (
              <p className="muted-copy">
                Billing is managed by a workspace owner or admin.
              </p>
            )}
          </div>
        ) : entitlement.plan !== 'teacher_free' ? (
          <p className="muted-copy">
            This plan is managed outside Stripe. Contact your workspace
            administrator for billing changes.
          </p>
        ) : (
          <div className="billing-upgrade-section">
            <p className="muted-copy">
              Teacher Free keeps your current classroom, assignments, and basic
              analytics available.
            </p>
            <div
              className="billing-price-options"
              aria-label="Calcura Classroom Pro pricing"
            >
              <div className="billing-price-option">
                <div>
                  <h3>Pro monthly</h3>
                  <p>
                    $19 <span>/ month</span>
                  </p>
                </div>
                {canUpgrade && (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void startCheckout('monthly')}
                    disabled={busy !== null}
                  >
                    {busy === 'monthly'
                      ? 'Opening checkout…'
                      : 'Upgrade monthly'}
                  </button>
                )}
              </div>
              <div className="billing-price-option">
                <div>
                  <h3>Pro annual</h3>
                  <p>
                    $149 <span>/ year</span>
                  </p>
                </div>
                {canUpgrade && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void startCheckout('annual')}
                    disabled={busy !== null}
                  >
                    {busy === 'annual'
                      ? 'Opening checkout…'
                      : 'Upgrade annually'}
                  </button>
                )}
              </div>
            </div>
            {!summaryLoading && !summaryError && !summary?.canManageBilling && (
              <p className="muted-copy">
                Ask a workspace owner or admin to manage billing.
              </p>
            )}
          </div>
        )}
        {actionError && (
          <p className="notice" role="alert">
            {actionError}
          </p>
        )}
      </article>
    </section>
  );
}

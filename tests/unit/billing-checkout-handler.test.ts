import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type Stripe from 'stripe';

const h = vi.hoisted(() => ({
  serve: vi.fn(),
  rpc: vi.fn(),
  authenticate: vi.fn(),
  role: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  createCustomer: vi.fn(),
  retrieveCustomer: vi.fn(),
  price: vi.fn(),
  product: vi.fn(),
  mode: 'test',
}));

vi.mock('../../supabase/functions/_shared/runtime.ts', () => {
  const env = (key: string) =>
    ({
      APP_ORIGIN: 'https://classroom.example.test',
      STRIPE_MODE: h.mode,
      STRIPE_SECRET_KEY: `sk_${h.mode}_fixture`,
      STRIPE_PRO_PRODUCT_ID: 'prod_Pro',
      STRIPE_PRO_MONTHLY_PRICE_ID: 'price_month',
      STRIPE_PRO_ANNUAL_PRICE_ID: 'price_year',
    })[key];
  return { runtime: { serve: h.serve, env: { get: env } }, requiredEnv: env };
});
vi.mock('../../supabase/functions/_shared/supabase.ts', () => ({
  authenticateRequest: h.authenticate,
  createAdminClient: () => ({ rpc: h.rpc }),
  workspaceBillingRole: h.role,
}));
vi.mock('stripe', () => ({
  default: class {
    static createFetchHttpClient = vi.fn();
    checkout = {
      sessions: { create: h.create, retrieve: h.retrieve, expire: h.expire },
    };
    customers = { create: h.createCustomer, retrieve: h.retrieveCustomer };
    prices = { retrieve: h.price };
    products = { retrieve: h.product };
  },
}));

const workspace = 'a7e04ca0-0864-48f2-9990-86df20d74bc2';
const actor = 'b8f15db1-1975-49f3-a291-97e31e8a6cd3';
const oldAttempt = 'c9e04ca0-0864-48f2-9990-86df20d74bc2';
const newAttempt = 'dae04ca0-0864-48f2-9990-86df20d74bc2';
const customer = 'cus_workspace';
const oldSession = 'cs_test_old';
let handler: (request: Request) => Promise<Response>;

function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    object: 'checkout.session',
    id: oldSession,
    livemode: false,
    mode: 'subscription',
    status: 'open',
    customer,
    client_reference_id: workspace,
    metadata: { workspace_id: workspace, billing_interval: 'monthly' },
    subscription: null,
    payment_link: null,
    recovered_from: null,
    after_expiration: null,
    payment_status: 'unpaid',
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    url: 'https://checkout.stripe.com/c/pay/cs_test_old',
    ...overrides,
  };
}

function reservation(state: string, overrides = {}) {
  return {
    reservation_state: state,
    attempt_id: oldAttempt,
    stripe_customer_id: customer,
    checkout_session_id: oldSession,
    ...overrides,
  };
}
function reserved() {
  return reservation('reserved', {
    attempt_id: newAttempt,
    checkout_session_id: null,
  });
}
function rows(row: ReturnType<typeof reservation>) {
  return { data: [row], error: null };
}
const rpcNames = () => h.rpc.mock.calls.map(([name]) => name);

async function call(interval = 'annual', extra = {}) {
  const response = await handler(
    new Request('https://edge.example.test/billing-checkout', {
      method: 'POST',
      headers: {
        Origin: 'https://classroom.example.test',
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: workspace,
        billing_interval: interval,
        ...extra,
      }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  // A dynamic path keeps Deno-only npm imports out of the browser tsc project;
  // Vitest loads the actual entrypoint and captures its registered handler.
  const entry = '../../supabase/functions/billing-checkout/index.ts';
  await import(entry);
  handler = h.serve.mock.calls[0]![0];
});

beforeEach(() => {
  [
    h.rpc,
    h.authenticate,
    h.role,
    h.create,
    h.retrieve,
    h.expire,
    h.createCustomer,
    h.retrieveCustomer,
    h.price,
    h.product,
  ].forEach((mock) => mock.mockReset());
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  h.mode = 'test';
  h.authenticate.mockResolvedValue({ userId: actor });
  h.role.mockResolvedValue('owner');
  h.rpc.mockImplementation(async (name: string) => {
    if (name === 'reserve_workspace_checkout')
      return rows(reservation('switch_session'));
    if (name === 'replace_workspace_checkout_after_expire')
      return rows(reserved());
    if (
      name === 'save_workspace_checkout_session' ||
      name === 'save_workspace_stripe_customer'
    )
      return { data: null, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
  h.retrieve.mockResolvedValue(session());
  h.expire.mockResolvedValue(session({ status: 'expired', url: null }));
  h.retrieveCustomer.mockResolvedValue({ id: customer, livemode: false });
  h.createCustomer.mockResolvedValue({ id: customer, livemode: false });
  h.price.mockImplementation(async (id: string) => ({
    id,
    active: true,
    livemode: h.mode === 'live',
    currency: 'usd',
    product: { id: 'prod_Pro', active: true, livemode: h.mode === 'live' },
    unit_amount: id === 'price_year' ? 14900 : 1900,
    recurring: {
      interval: id === 'price_year' ? 'year' : 'month',
      interval_count: 1,
    },
  }));
  h.create.mockImplementation(
    async (params: Stripe.Checkout.SessionCreateParams) =>
      session({
        id: `cs_${h.mode}_new`,
        livemode: h.mode === 'live',
        metadata: params.metadata as Record<string, string>,
        url: `https://checkout.stripe.com/c/pay/cs_${h.mode}_new`,
      }),
  );
});

afterEach(() => {
  // Checkout must never call reconciliation, release-then-reserve, or any
  // entitlement mutation, on successful paths OR failures/races.
  expect(
    rpcNames().every((name) =>
      [
        'reserve_workspace_checkout',
        'replace_workspace_checkout_after_expire',
        'save_workspace_checkout_session',
        'save_workspace_stripe_customer',
      ].includes(name),
    ),
  ).toBe(true);
});

describe('actual billing-checkout handler with mocked Stripe SDK', () => {
  it.each(['monthly', 'annual'])(
    'reuses the open same-%s URL without expiration/creation',
    async (interval) => {
      h.rpc.mockResolvedValue(rows(reservation('existing_session')));
      h.retrieve.mockResolvedValue(
        session({
          metadata: { workspace_id: workspace, billing_interval: interval },
        }),
      );
      expect(await call(interval)).toEqual({
        status: 200,
        body: { checkout_url: session().url },
      });
      expect(h.expire).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
    },
  );

  it.each([
    ['monthly', 'annual', 'price_year'],
    ['annual', 'monthly', 'price_month'],
  ])(
    'switches %s to %s with the server-selected price',
    async (from, to, price) => {
      const old = session({
        metadata: { workspace_id: workspace, billing_interval: from },
      });
      h.retrieve.mockResolvedValue(old);
      h.expire.mockResolvedValue({ ...old, status: 'expired', url: null });
      expect(
        await call(to, {
          price_id: 'price_attacker',
          session_id: 'cs_test_attacker',
        }),
      ).toEqual({
        status: 200,
        body: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_new' },
      });
      expect(h.expire).toHaveBeenCalledExactlyOnceWith(
        oldSession,
        {},
        {
          idempotencyKey: `workspace-checkout-expire-${oldAttempt}-${oldSession}`,
        },
      );
      expect(h.rpc).toHaveBeenCalledWith(
        'replace_workspace_checkout_after_expire',
        {
          p_workspace_id: workspace,
          p_actor_user_id: actor,
          p_expected_attempt_id: oldAttempt,
          p_expected_session_id: oldSession,
          p_billing_interval: to,
        },
      );
      expect(h.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          customer,
          mode: 'subscription',
          line_items: [{ price, quantity: 1 }],
          metadata: { workspace_id: workspace, billing_interval: to },
        }),
        { idempotencyKey: `workspace-checkout-${newAttempt}` },
      );
      expect(rpcNames()).toEqual([
        'reserve_workspace_checkout',
        'replace_workspace_checkout_after_expire',
        'save_workspace_checkout_session',
      ]);
      expect(h.expire.mock.invocationCallOrder[0]).toBeLessThan(
        h.rpc.mock.invocationCallOrder[1]!,
      );
      expect(h.rpc.mock.invocationCallOrder[1]).toBeLessThan(
        h.create.mock.invocationCallOrder[0]!,
      );
      expect(h.create.mock.calls[0]![0].success_url).toBe(
        'https://classroom.example.test/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      );
    },
  );

  it('creates the initial monthly checkout without expiring anything', async () => {
    h.rpc.mockResolvedValueOnce(rows(reserved()));
    expect((await call('monthly')).status).toBe(200);
    expect(h.expire).not.toHaveBeenCalled();
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.create.mock.calls[0]![0].line_items).toEqual([
      { price: 'price_month', quantity: 1 },
    ]);
  });

  it.each(['existing_session', 'switch_session'])(
    'replaces an already expired %s in the same request',
    async (state) => {
      h.rpc.mockResolvedValueOnce(rows(reservation(state)));
      h.retrieve.mockResolvedValue(session({ status: 'expired', url: null }));
      expect(
        (await call(state === 'existing_session' ? 'monthly' : 'annual'))
          .status,
      ).toBe(200);
      expect(h.expire).not.toHaveBeenCalled();
      expect(h.create).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['existing_session', 'switch_session'])(
    'blocks switching/resuming a completed %s',
    async (state) => {
      h.rpc.mockResolvedValueOnce(rows(reservation(state)));
      h.retrieve.mockResolvedValue(
        session({
          status: 'complete',
          subscription: 'sub_completed',
          url: null,
        }),
      );
      expect(
        await call(state === 'existing_session' ? 'monthly' : 'annual'),
      ).toEqual({
        status: 409,
        body: { error: 'checkout_processing', retry: true },
      });
      expect(h.expire).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
    },
  );

  it('re-retrieves after expiration loses to completion and never replaces', async () => {
    h.expire.mockRejectedValue(new Error('Stripe session is no longer open'));
    h.retrieve.mockResolvedValueOnce(session()).mockResolvedValueOnce(
      session({
        status: 'complete',
        subscription: 'sub_completed',
        url: null,
      }),
    );
    expect((await call()).body).toEqual({
      error: 'checkout_processing',
      retry: true,
    });
    expect(h.retrieve).toHaveBeenCalledTimes(2);
    expect(h.create).not.toHaveBeenCalled();
    expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
  });

  it('recovers an expiration whose successful response was lost', async () => {
    h.expire.mockRejectedValue(new Error('lost response'));
    h.retrieve
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session({ status: 'expired', url: null }));
    expect((await call()).status).toBe(200);
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it.each(['open', 'retrieve-fails'])(
    'does not rotate DB after unconfirmed expiration (%s)',
    async (outcome) => {
      h.expire.mockRejectedValue(new Error('PRIVATE upstream failure'));
      if (outcome === 'retrieve-fails')
        h.retrieve
          .mockResolvedValueOnce(session())
          .mockRejectedValueOnce(new Error('PRIVATE retrieve failure'));
      expect(await call()).toEqual({
        status: 502,
        body: { error: 'billing_unavailable' },
      });
      expect(h.create).not.toHaveBeenCalled();
      expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
    },
  );

  it('re-evaluates a stale handoff and reuses the winner without creating', async () => {
    h.rpc
      .mockResolvedValueOnce(rows(reservation('switch_session')))
      .mockResolvedValueOnce(
        rows(
          reservation('stale', {
            attempt_id: null,
            checkout_session_id: null,
            stripe_customer_id: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        rows(
          reservation('existing_session', {
            attempt_id: newAttempt,
            checkout_session_id: 'cs_test_winner',
          }),
        ),
      );
    h.retrieve.mockResolvedValueOnce(session()).mockResolvedValueOnce(
      session({
        id: 'cs_test_winner',
        metadata: { workspace_id: workspace, billing_interval: 'annual' },
        url: 'https://checkout.stripe.com/c/pay/cs_test_winner',
      }),
    );
    expect((await call()).body).toEqual({
      checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_winner',
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns a transient conflict while the replacement winner is creating', async () => {
    h.rpc
      .mockResolvedValueOnce(rows(reservation('switch_session')))
      .mockResolvedValueOnce(rows(reservation('stale')))
      .mockResolvedValueOnce(rows(reservation('in_progress')));
    expect((await call()).body).toEqual({
      error: 'checkout_in_progress',
      retry: true,
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('bounds repeated stale handoffs to three evaluations', async () => {
    h.rpc.mockImplementation(async (name) =>
      rows(
        reservation(
          name === 'reserve_workspace_checkout' ? 'switch_session' : 'stale',
        ),
      ),
    );
    h.retrieve.mockResolvedValue(session({ status: 'expired', url: null }));
    expect((await call()).body).toEqual({
      error: 'checkout_in_progress',
      retry: true,
    });
    expect(
      rpcNames().filter((name) => name === 'reserve_workspace_checkout'),
    ).toHaveLength(3);
    expect(h.create).not.toHaveBeenCalled();
  });

  it.each([
    { livemode: true },
    { id: 'cs_test_foreign' },
    { mode: 'payment' },
    { client_reference_id: 'other-workspace' },
    { metadata: { workspace_id: 'other', billing_interval: 'monthly' } },
    { customer: 'cus_foreign' },
    { metadata: { workspace_id: workspace, billing_interval: 'weekly' } },
    { payment_link: 'plink_other' },
    { recovered_from: 'cs_test_other' },
    { after_expiration: { recovery: { enabled: true } } },
    { status: null },
    { status: 'expired', subscription: 'sub_already_exists' },
  ])(
    'rejects a saved session with a mismatched association/mode: %j',
    async (overrides) => {
      h.retrieve.mockResolvedValue(
        session(overrides as Partial<Stripe.Checkout.Session>),
      );
      expect(await call()).toEqual({
        status: 502,
        body: { error: 'billing_unavailable' },
      });
      expect(h.expire).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
    },
  );

  it('validates the expiration response too', async () => {
    h.expire.mockResolvedValue(
      session({ status: 'expired', customer: 'cus_foreign', url: null }),
    );
    expect((await call()).body).toEqual({ error: 'billing_unavailable' });
    expect(h.create).not.toHaveBeenCalled();
    expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
  });

  it('supports consistent live-mode session switching using mocked SDK objects only', async () => {
    h.mode = 'live';
    h.rpc.mockResolvedValueOnce(
      rows(
        reservation('switch_session', { checkout_session_id: 'cs_live_old' }),
      ),
    );
    h.retrieve.mockResolvedValue(
      session({ id: 'cs_live_old', livemode: true }),
    );
    h.expire.mockResolvedValue(
      session({
        id: 'cs_live_old',
        livemode: true,
        status: 'expired',
        url: null,
      }),
    );
    h.retrieveCustomer.mockResolvedValue({ id: customer, livemode: true });
    expect((await call()).status).toBe(200);
  });

  it('validates target Price/Product before expiring the old session', async () => {
    h.price.mockResolvedValue({
      id: 'price_year',
      livemode: true,
      active: true,
    });
    expect((await call()).body).toEqual({ error: 'billing_unavailable' });
    expect(h.expire).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it.each(['at-reservation', 'at-handoff'])(
    'blocks an existing subscription %s',
    async (when) => {
      if (when === 'at-reservation')
        h.rpc.mockResolvedValueOnce(rows(reservation('existing_subscription')));
      else
        h.rpc
          .mockResolvedValueOnce(rows(reservation('switch_session')))
          .mockResolvedValueOnce(rows(reservation('existing_subscription')));
      expect((await call()).body).toEqual({
        error: 'subscription_exists',
        manage_billing: true,
      });
      expect(h.create).not.toHaveBeenCalled();
    },
  );

  it.each(['educator', null])(
    'rejects unauthorized role %s before reserving or contacting Stripe',
    async (role) => {
      h.role.mockResolvedValue(role);
      expect((await call()).body).toEqual({ error: 'not_authorized' });
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.retrieve).not.toHaveBeenCalled();
    },
  );

  it('rejects anonymous calls before reserving', async () => {
    h.authenticate.mockRejectedValue(new Error('not_authorized'));
    expect((await call()).status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('rejects unsupported intervals before reserving', async () => {
    expect((await call('weekly')).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('does not release/rotate an attempt when creation or saving has an unknown outcome', async () => {
    h.rpc.mockResolvedValueOnce(rows(reserved())).mockResolvedValueOnce({
      data: null,
      error: { code: '08006', message: 'PRIVATE database failure' },
    });
    expect((await call()).body).toEqual({ error: 'billing_unavailable' });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(rpcNames()).toEqual([
      'reserve_workspace_checkout',
      'save_workspace_checkout_session',
    ]);
  });

  it('allows exactly one concurrent switching request to create a replacement', async () => {
    let releaseExpiration!: () => void;
    let openSessions = 1;
    const expiration = new Promise((resolve) => {
      releaseExpiration = () => {
        openSessions = 0;
        resolve(session({ status: 'expired', url: null }));
      };
    });
    h.expire.mockReturnValue(expiration);
    let claims = 0;
    h.rpc.mockImplementation(async (name) => {
      if (name === 'reserve_workspace_checkout')
        return rows(
          reservation(++claims === 1 ? 'switch_session' : 'in_progress'),
        );
      if (name === 'replace_workspace_checkout_after_expire')
        return rows(reserved());
      return { data: null, error: null };
    });
    h.create.mockImplementation(async () => {
      expect(openSessions).toBe(0);
      openSessions += 1;
      return session({
        id: 'cs_test_new',
        metadata: { workspace_id: workspace, billing_interval: 'annual' },
        url: 'https://checkout.stripe.com/c/pay/cs_test_new',
      });
    });
    const first = call();
    await vi.waitFor(() => expect(h.expire).toHaveBeenCalledTimes(1));
    expect((await call()).body).toEqual({
      error: 'checkout_in_progress',
      retry: true,
    });
    releaseExpiration();
    expect((await first).status).toBe(200);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(openSessions).toBe(1);
  });

  it('reports an overdue unknown creation as unavailable without rotating or creating', async () => {
    h.rpc.mockResolvedValueOnce(
      rows(reservation('unavailable', { checkout_session_id: null })),
    );
    expect((await call()).body).toEqual({ error: 'billing_unavailable' });
    expect(h.create).not.toHaveBeenCalled();
    expect(rpcNames()).toEqual(['reserve_workspace_checkout']);
  });

  it('keeps the authorization error when membership is revoked before handoff', async () => {
    h.rpc
      .mockResolvedValueOnce(rows(reservation('switch_session')))
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'not_authorized' },
      });
    expect(await call()).toEqual({
      status: 401,
      body: { error: 'not_authorized' },
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('never starts a second creation after a stale save reveals a subscription', async () => {
    h.rpc
      .mockResolvedValueOnce(rows(reserved()))
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'checkout_reservation_expired' },
      })
      .mockResolvedValueOnce(rows(reservation('existing_subscription')));
    expect((await call()).body).toEqual({
      error: 'subscription_exists',
      manage_billing: true,
    });
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed if the stored customer has been deleted', async () => {
    h.rpc.mockResolvedValueOnce(rows(reserved()));
    h.retrieveCustomer.mockResolvedValue({ id: customer, deleted: true });
    expect((await call()).body).toEqual({ error: 'billing_unavailable' });
    expect(h.create).not.toHaveBeenCalled();
  });
});

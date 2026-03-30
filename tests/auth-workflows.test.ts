// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
}));

const { sendTransactionalEmailMock } = vi.hoisted(() => ({
  sendTransactionalEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("@/lib/email", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));
vi.mock("server-only", () => ({}));

import {
  acceptInviteOnServer,
  createPasswordResetRequestAndSendEmail,
  ensureProfileForAuthenticatedUserOnServer,
} from "@/lib/server/auth-workflows";

type MockInvite = {
  id: string;
  token: string;
  email: string;
  role: "coach" | "athlete" | "independent_athlete";
  coach_id: string | null;
  status: "pending" | "accepted";
  expires_at: string;
  created_at?: string;
};

type MockProfile = {
  id: string;
  role: "admin" | "coach" | "athlete" | "independent_athlete";
  status: "active" | "invited";
  full_name: string;
  email: string;
  created_at?: string;
  updated_at?: string;
};

type MockAuthUser = {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createMockAdminClient({
  invites,
  profiles,
  authUsers,
}: {
  invites: MockInvite[];
  profiles?: MockProfile[];
  authUsers?: MockAuthUser[];
}) {
  const inviteRows = new Map(invites.map((invite) => [invite.id, { ...invite, created_at: invite.created_at ?? new Date().toISOString() }]));
  const profileRows = new Map((profiles ?? []).map((profile) => [profile.id, { ...profile }]));
  const assignmentRows: Array<{ coach_id: string; athlete_id: string; active: boolean; created_at: string }> = [];
  const passwordResetRows: Array<Record<string, unknown>> = [];
  const authUserRows = new Map((authUsers ?? []).map((user) => [user.id, { ...user }]));

  const findInvite = (filters: Array<{ kind: "eq" | "ilike"; column: string; value: unknown }>) =>
    Array.from(inviteRows.values()).find((invite) =>
      filters.every((filter) => {
        const currentValue = invite[filter.column as keyof typeof invite];
        if (filter.kind === "eq") {
          return currentValue === filter.value;
        }

        return String(currentValue ?? "").toLowerCase() === String(filter.value ?? "").toLowerCase();
      }),
    ) ?? null;

  const findProfile = (filters: Array<{ kind: "eq" | "ilike"; column: string; value: unknown }>) =>
    Array.from(profileRows.values()).find((profile) =>
      filters.every((filter) => {
        const currentValue = profile[filter.column as keyof typeof profile];
        if (filter.kind === "eq") {
          return currentValue === filter.value;
        }

        return String(currentValue ?? "").toLowerCase() === String(filter.value ?? "").toLowerCase();
      }),
    ) ?? null;

  const findAssignment = (filters: Array<{ kind: "eq"; column: string; value: unknown }>) =>
    assignmentRows.find((assignment) =>
      filters.every((filter) => assignment[filter.column as keyof typeof assignment] === filter.value),
    ) ?? null;

  const client = {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: {
            users: Array.from(authUserRows.values()),
            aud: "authenticated",
            nextPage: null,
            lastPage: 1,
            total: authUserRows.size,
          },
          error: null,
        })),
        updateUserById: vi.fn(async (userId: string, attributes: { password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) => {
          const existingUser = authUserRows.get(userId) ?? null;
          if (!existingUser) {
            return { data: { user: null }, error: { message: "User not found" } };
          }

          const nextUser = {
            ...existingUser,
            user_metadata: {
              ...(existingUser.user_metadata ?? {}),
              ...(attributes.user_metadata ?? {}),
            },
          };
          authUserRows.set(userId, nextUser);
          return { data: { user: nextUser }, error: null };
        }),
        createUser: vi.fn(async (attributes: { email: string; user_metadata?: Record<string, unknown> }) => {
          const id = `auth-${authUserRows.size + 1}`;
          const nextUser = {
            id,
            email: attributes.email,
            user_metadata: attributes.user_metadata ?? {},
          };
          authUserRows.set(id, nextUser);
          return { data: { user: nextUser }, error: null };
        }),
        deleteUser: vi.fn(async (userId: string) => {
          authUserRows.delete(userId);
          return { data: { user: null }, error: null };
        }),
      },
    },
    from(table: string) {
      const filters: Array<{ kind: "eq" | "ilike"; column: string; value: unknown }> = [];
      let mode: "select" | "update" = "select";
      let updateValues: Record<string, unknown> | null = null;

      const execute = async () => {
        if (mode === "update" && updateValues) {
          if (table === "invites") {
            const invite = findInvite(filters);
            if (invite) {
              Object.assign(invite, updateValues);
            }
            return { data: invite, error: null };
          }

          if (table === "password_reset_requests") {
            passwordResetRows.forEach((row) => {
              const matches = filters.every((filter) => {
                const value = row[filter.column];
                if (filter.kind === "eq") {
                  return value === filter.value;
                }

                return String(value ?? "").toLowerCase() === String(filter.value ?? "").toLowerCase();
              });

              if (matches) {
                Object.assign(row, updateValues);
              }
            });
            return { data: null, error: null };
          }

          return { data: null, error: null };
        }

        return { data: null, error: null };
      };

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push({ kind: "eq", column, value });
          return builder;
        }),
        is: vi.fn((column: string, value: unknown) => {
          filters.push({ kind: "eq", column, value });
          return builder;
        }),
        ilike: vi.fn((column: string, value: unknown) => {
          filters.push({ kind: "ilike", column, value });
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        update: vi.fn((values: Record<string, unknown>) => {
          mode = "update";
          updateValues = values;
          return builder;
        }),
        insert: vi.fn(async (values: Record<string, unknown>) => {
          if (table === "coach_athlete_assignments") {
            assignmentRows.push(values as { coach_id: string; athlete_id: string; active: boolean; created_at: string });
          }

          if (table === "password_reset_requests") {
            passwordResetRows.push({ ...values });
          }

          return { data: null, error: null };
        }),
        upsert: vi.fn(async (values: Record<string, unknown>) => {
          if (table === "profiles") {
            profileRows.set(String(values.id), {
              id: String(values.id),
              role: values.role as MockProfile["role"],
              status: values.status as MockProfile["status"],
              full_name: String(values.full_name),
              email: normalizeEmail(String(values.email)),
            });
          }

          return { data: null, error: null };
        }),
        then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
          execute().then(resolve, reject),
        maybeSingle: vi.fn(async () => {
          if (mode === "update" && updateValues) {
            if (table === "invites") {
              const invite = findInvite(filters);
              if (invite) {
                Object.assign(invite, updateValues);
              }
              return { data: invite, error: null };
            }
          }

          if (table === "invites") {
            return { data: findInvite(filters), error: null };
          }

          if (table === "profiles") {
            return { data: findProfile(filters), error: null };
          }

          if (table === "coach_athlete_assignments") {
            return { data: findAssignment(filters as Array<{ kind: "eq"; column: string; value: unknown }>), error: null };
          }

          return { data: null, error: null };
        }),
      };

      return builder;
    },
  };

  return {
    client,
      state: {
        inviteRows,
        profileRows,
        assignmentRows,
        passwordResetRows,
        authUserRows,
      },
    };
}

beforeEach(() => {
  createSupabaseAdminClientMock.mockReset();
  sendTransactionalEmailMock.mockReset();
  sendTransactionalEmailMock.mockResolvedValue({ ok: true });
});

describe("auth workflows", () => {
  it("repairs a missing public profile when the auth user already exists during invite activation", async () => {
    const mock = createMockAdminClient({
      invites: [
        {
          id: "invite-1",
          token: "token-1",
          email: "athlete@example.com",
          role: "athlete",
          coach_id: "coach-1",
          status: "pending",
          expires_at: "2099-01-01T00:00:00.000Z",
        },
      ],
      authUsers: [
        {
          id: "auth-existing-1",
          email: "athlete@example.com",
          user_metadata: {},
        },
      ],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await acceptInviteOnServer({
      token: "token-1",
      fullName: "Athlete One",
      password: "secret123",
    });

    expect(result.ok).toBe(true);
    expect(result.email).toBe("athlete@example.com");
    expect(mock.state.profileRows.get("auth-existing-1")).toMatchObject({
      id: "auth-existing-1",
      status: "active",
      full_name: "Athlete One",
      email: "athlete@example.com",
    });
    expect(mock.state.inviteRows.get("invite-1")?.status).toBe("accepted");
    expect(mock.state.assignmentRows).toContainEqual(
      expect.objectContaining({
        coach_id: "coach-1",
        athlete_id: "auth-existing-1",
        active: true,
      }),
    );
    expect(mock.client.auth.admin.updateUserById).toHaveBeenCalledWith(
      "auth-existing-1",
      expect.objectContaining({
        password: "secret123",
        email_confirm: true,
      }),
    );
  });

  it("rebuilds the missing public profile for an already authenticated user from the invite record", async () => {
    const mock = createMockAdminClient({
      invites: [
        {
          id: "invite-2",
          token: "token-2",
          email: "athlete2@example.com",
          role: "athlete",
          coach_id: "coach-9",
          status: "accepted",
          expires_at: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await ensureProfileForAuthenticatedUserOnServer({
      authUserId: "auth-user-2",
      email: "athlete2@example.com",
      fullName: "Athlete Two",
    });

    expect(result).toEqual({
      ok: true,
      repaired: true,
    });
    expect(mock.state.profileRows.get("auth-user-2")).toMatchObject({
      id: "auth-user-2",
      status: "active",
      full_name: "Athlete Two",
      email: "athlete2@example.com",
    });
    expect(mock.state.assignmentRows).toContainEqual(
      expect.objectContaining({
        coach_id: "coach-9",
        athlete_id: "auth-user-2",
        active: true,
      }),
    );
    expect(mock.state.inviteRows.get("invite-2")?.status).toBe("accepted");
  });

  it("returns an explicit failure when no invite exists for an authenticated user missing a profile", async () => {
    const mock = createMockAdminClient({
      invites: [],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await ensureProfileForAuthenticatedUserOnServer({
      authUserId: "auth-user-missing",
      email: "missing@example.com",
      fullName: "Missing User",
    });

    expect(result).toEqual({
      ok: false,
      message: "Käyttäjäprofiilia ei löytynyt eikä sähköpostille löytynyt kutsua.",
    });
  });

  it("creates a self-service password reset request using email lookup without an authenticated requester", async () => {
    const mock = createMockAdminClient({
      invites: [],
      profiles: [
        {
          id: "athlete-1",
          role: "athlete",
          status: "active",
          full_name: "Athlete One",
          email: "athlete@example.com",
        },
      ],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await createPasswordResetRequestAndSendEmail({
      requester: null,
      targetEmail: "athlete@example.com",
      origin: "https://rooki.fit",
      mode: "self_service",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe(
      "Jos sähköpostiosoite löytyy järjestelmästä, lähetämme salasanan nollauslinkin hetken kuluttua.",
    );
    expect(mock.state.passwordResetRows).toHaveLength(1);
    expect(mock.state.passwordResetRows[0]).toMatchObject({
      email: "athlete@example.com",
      requested_by_role: "self_service",
      requested_by_user_id: null,
      user_id: "athlete-1",
    });
  });

  it("returns the same self-service reset response when email is missing", async () => {
    const mock = createMockAdminClient({
      invites: [],
      profiles: [],
    });

    createSupabaseAdminClientMock.mockReturnValue(mock.client);

    const result = await createPasswordResetRequestAndSendEmail({
      requester: null,
      targetEmail: "missing@example.com",
      origin: "https://rooki.fit",
      mode: "self_service",
    });

    expect(result).toEqual({
      ok: true,
      message: "Jos sähköpostiosoite löytyy järjestelmästä, lähetämme salasanan nollauslinkin hetken kuluttua.",
    });
    expect(mock.state.passwordResetRows).toHaveLength(0);
  });
});

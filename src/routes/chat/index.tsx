import { component$, useSignal, useStore, useVisibleTask$ } from '@builder.io/qwik';
import { LuCamera, LuCheck, LuEye, LuEyeOff, LuFlaskConical, LuImage, LuLock, LuPencil, LuOrbit, LuServer, LuSparkles, LuUser, LuX } from '@qwikest/icons/lucide';
import { useSignIn, useSession, useSignOut } from '~/routes/plugin@auth';
import { StoatChat, type StoatChatState } from '~/components/stoat-chat/stoat-chat';
import { acceptFriendRequest, uploadFile, editUserProfile, fetchUserBanner, avatarUrl } from '~/components/stoat-chat/stoat_scripts';
import './chat.css';

// Add invite codes for private servers here (leave empty if none)
const PENDING_INVITE_CODES: string[] = [];

type InviteInfo = { server_id: string; server_name: string; member_count?: number };

export default component$(() => {
  const session = useSession();
  const signIn = useSignIn();
  const signOut = useSignOut();
  const svgRef = useSignal<SVGSVGElement>();
  const signInError = useSignal("");
  const registerError = useSignal("");
  const showSignInPassword = useSignal(false);
  const showRegPassword = useSignal(false);
  const regPassword = useSignal("");
  const regConfirmPassword = useSignal("");
  const stoatUser = useSignal<{ username: string; discriminator: string; display_name: string | null; avatar_url?: string | null; banner_url?: string | null } | null>(null);
  const editingProfile = useSignal(false);
  const editDisplayName = useSignal('');
  const profileSaving = useSignal(false);
  const profileError = useSignal('');
  const friendBanners = useSignal<Record<string, string>>({});
  const chatState = useStore<StoatChatState>({
    joinedServers: [],
    activeServerId: '',
    activeDmUserId: '',
    activeDmSeq: 0,
    currentUserId: '',
    wsReady: false,
    relations: [],
    userNames: {},
    userAvatars: {},
    serverEmojis: {},
  });
  const fetchedInvites = useSignal<Record<string, InviteInfo>>({});

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const token = track(() => session.value?.user?.stoat_token);
    if (!token) {
      stoatUser.value = null;
      return;
    }
    try {
      const res = await fetch("https://chat.chemistryml.com/api/users/@me", {
        headers: { "x-session-token": token },
      });
      if (res.ok) {
        const data = await res.json();
        stoatUser.value = {
          username: data.username,
          discriminator: data.discriminator,
          display_name: data.display_name ?? null,
          avatar_url: data.avatar ? `https://chat.chemistryml.com/autumn/${data.avatar.tag}/${data.avatar._id}` : null,
          banner_url: data.profile?.background
            ? `https://chat.chemistryml.com/autumn/${data.profile.background.tag}/${data.profile.background._id}`
            : null,
        };
        chatState.currentUserId = data._id ?? '';
        // Fetch banner via profile endpoint (GET /users/@me may not include profile.background)
        if (data._id) {
          const bannerFromProfile = await fetchUserBanner(data._id, token);
          if (bannerFromProfile && stoatUser.value) {
            stoatUser.value = { ...stoatUser.value, banner_url: bannerFromProfile };
          }
        }
      }
    } catch {
      // silently ignore — session.user fields are still available as fallback
    }
  });

  // Fetch invite info for each pending invite code so we can check join status
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const token = track(() => session.value?.user?.stoat_token);
    if (!token || PENDING_INVITE_CODES.length === 0) return;
    const results: Record<string, InviteInfo> = {};
    await Promise.all(PENDING_INVITE_CODES.map(async (code) => {
      try {
        const r = await fetch(`https://chat.chemistryml.com/api/invites/${code}`, {
          headers: { 'x-session-token': token },
        });
        if (r.ok) {
          const data = await r.json();
          results[code] = { server_id: data.server_id, server_name: data.server_name, member_count: data.member_count };
        }
      } catch { /* ignore */ }
    }));
    fetchedInvites.value = results;
  });

  // Fetch banners for friends when WS connects and friends list populates
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => chatState.wsReady);
    track(() => chatState.relations.filter(r => r.status === 'Friend').length);
    const token = session.value?.user?.stoat_token;
    if (!token || !chatState.wsReady) return;
    const friends = chatState.relations.filter(r => r.status === 'Friend');
    const toFetch = friends.filter(r => !(r._id in friendBanners.value));
    if (toFetch.length === 0) return;
    const results: Record<string, string> = {};
    await Promise.all(toFetch.map(async (rel) => {
      const url = await fetchUserBanner(rel._id, token);
      if (url) results[rel._id] = url;
    }));
    if (Object.keys(results).length) {
      friendBanners.value = { ...friendBanners.value, ...results };
    }
  });

  const publicServers = [
    {
      icon: LuFlaskConical,
      title: 'General Chemistry',
      description: 'General chat for all topics.',
      real: true,
      code: 'https://chat.chemistryml.com/invite/TArGFQbJ'
    },
    {
      icon: LuSparkles,
      title: 'AI Experiments',
      description: 'Share models, compare outputs, and share agentic workflows.',
      real: false,
    },
    {
      icon: LuOrbit,
      title: 'Workflow Automation',
      description: 'Trade ideas for pipelines, batch processing, and reproducibility.',
      real: false,
    },
    /*
    
    {
      icon: LuMicroscope,
      title: 'Spectra Review',
      description: 'Discuss NMR, LC-MS, and IR interpretation with the community.',
      real: false,
    },
    {
      icon: LuAreaChart,
      title: 'Analytics Corner',
      description: 'Review datasets, compare methods, and discuss statistical approaches.',
      real: false,
    },
    {
      icon: LuStickyNote,
      title: 'Lab Notebook',
      description: 'Organize protocols, observations, and daily experimental notes.',
      real: false,
    },
    {
      icon: LuFlaskConical,
      title: 'Compound Design',
      description: 'Explore structure ideas, analog series, and optimization strategies.',
      real: false,
    },
    {
      icon: LuFactory,
      title: 'Automation Hub',
      description: 'Share scripts, agents, and workflow shortcuts for routine tasks.',
      real: false,
    },
    {
      icon: LuScaling,
      title: 'Scale-Up Support',
      description: 'Discuss translation from bench scale to pilot and production.',
      real: false,
    },
    {
      icon: LuArrowLeftRight,
      title: 'Methods Exchange',
      description: 'Post protocols, compare conditions, and refine experimental methods.',
      real: false,
    },
    {
      icon: LuListTodo,
      title: 'Prompt Lab',
      description: 'Iterate on prompts, templates, and model-assisted analysis ideas.',
      real: false,
    },
    {
      icon: LuMessageSquareDashed,
      title: 'Results Board',
      description: 'Share highlights, summarize outcomes, and compare observations.',
      real: false,
    },*/
  ];


  useVisibleTask$(({ cleanup }) => {
    let rafId: number | null = null;
    const onMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const svg = svgRef.value;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          const grad = svg.querySelector('#cursor-grad');
          if (grad) {
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
              grad.setAttribute('cx', '-9999');
              grad.setAttribute('cy', '-9999');
            } else {
              grad.setAttribute('cx', String(x));
              grad.setAttribute('cy', String(y));
            }
          }
        }
        rafId = null;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    cleanup(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
    });
  });

  const input_style = "w-full rounded px-3 py-2 active:outline-none focus:ring-none focus:outline-none focus:bg-(--color-rim) transition-colors text-(--color-accent-muted)";

  return (
    <div class="">


      <section class="relative section-container flex flex-row">
        <div class="section-padding dash-left" />
        <div class="flex flex-col w-[var(--inner-width)] max-w-[100vw] mx-auto">
          {/* --------- user info section -------- */}
          {session.value?.user ? (
            <div class="relative dash-left dash-right w-full p-8 flex flex-col items-center gap-6">
              <h2 class="text-ink text-center">Your Profile</h2>

              {/* Profile card */}
              <div class="relative rounded-2xl overflow-hidden w-full max-w-lg" style={{ minHeight: '130px' }}>
                {/* Banner background */}
                {stoatUser.value?.banner_url ? (
                  <>
                    <div class="absolute inset-0" style={`background: url('${stoatUser.value.banner_url}') center/cover no-repeat`} />
                    <div class="absolute inset-0 bg-black/55" />
                  </>
                ) : (
                  <div class="absolute inset-0 bg-(--color-canvas) rounded-2xl" />
                )}

                {/* Banner upload button (edit mode only) */}
                {editingProfile.value && (
                  <label class="absolute top-3 right-3 z-20 cursor-pointer p-1.5 rounded-lg bg-black/40 hover:bg-black/60 transition-colors" title="Change banner">
                    <LuImage class="h-4 w-4 text-white" />
                    <input type="file" accept="image/*" class="sr-only" onChange$={async (_, el) => {
                      const file = el.files?.[0];
                      if (!file) return;
                      const tok = session.value?.user?.stoat_token;
                      if (!tok) return;
                      profileSaving.value = true;
                      profileError.value = '';
                      const fileId = await uploadFile(file, 'backgrounds', tok);
                      if (fileId) {
                        const ok = await editUserProfile({ profile_background: fileId }, tok);
                        if (ok && stoatUser.value) {
                          stoatUser.value = { ...stoatUser.value, banner_url: URL.createObjectURL(file) };
                        } else if (!ok) {
                          profileError.value = 'Failed to update banner.';
                        }
                      } else {
                        profileError.value = 'Failed to upload banner.';
                      }
                      profileSaving.value = false;
                      el.value = '';
                    }} />
                  </label>
                )}

                {/* Card content */}
                <div class="relative z-10 flex items-start gap-4 p-6">
                  {/* Avatar */}
                  <div class="shrink-0 relative group/av">
                    <div class={`rounded-full overflow-hidden w-[80px] h-[80px] flex items-center justify-center border-2 ${stoatUser.value?.banner_url ? 'border-white/30' : 'border-edge bg-(--color-surface)'}`}>
                      {stoatUser.value?.avatar_url
                        ? <img src={stoatUser.value.avatar_url} alt="Your avatar" class="w-full h-full object-cover" />
                        : <LuUser class="h-10 w-10 text-ink" />}
                    </div>
                    {editingProfile.value && (
                      <label class="absolute inset-0 rounded-full flex items-center justify-center bg-black/60 cursor-pointer opacity-0 group-hover/av:opacity-100 transition-opacity">
                        <LuCamera class="h-6 w-6 text-white" />
                        <input type="file" accept="image/*" class="sr-only" onChange$={async (_, el) => {
                          const file = el.files?.[0];
                          if (!file) return;
                          const tok = session.value?.user?.stoat_token;
                          if (!tok) return;
                          profileSaving.value = true;
                          profileError.value = '';
                          const fileId = await uploadFile(file, 'avatars', tok);
                          if (fileId) {
                            const ok = await editUserProfile({ avatar: fileId }, tok);
                            if (ok && stoatUser.value) {
                              stoatUser.value = { ...stoatUser.value, avatar_url: URL.createObjectURL(file) };
                            } else if (!ok) {
                              profileError.value = 'Failed to update avatar.';
                            }
                          } else {
                            profileError.value = 'Failed to upload avatar.';
                          }
                          profileSaving.value = false;
                          el.value = '';
                        }} />
                      </label>
                    )}
                  </div>

                  {/* Info */}
                  <div class="flex-1 min-w-0">
                    {editingProfile.value ? (
                      <input
                        class="w-full bg-black/30 text-white font-semibold text-xl rounded-lg px-3 py-1 border border-white/20 mb-1 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                        value={editDisplayName.value}
                        placeholder="Display name"
                        onInput$={(_, el) => editDisplayName.value = el.value}
                      />
                    ) : (
                      <p class={`font-semibold text-xl leading-tight ${stoatUser.value?.banner_url ? 'text-white' : 'text-ink'}`}>
                        {stoatUser.value?.display_name || stoatUser.value?.username || session.value.user.name || session.value.user.email}
                      </p>
                    )}
                    {stoatUser.value ? (
                      <p class={`text-sm -mt-0.5 ${stoatUser.value.banner_url || editingProfile.value ? 'text-white/60' : 'text-muted'}`}>
                        @{stoatUser.value.username}#{stoatUser.value.discriminator}
                      </p>
                    ) : session.value.user.email ? (
                      <p class="text-sm text-muted">{session.value.user.email}</p>
                    ) : null}

                    <div class="flex flex-wrap gap-2 mt-3">
                      {editingProfile.value ? (
                        <>
                          <button
                            class="btn-pill text-xs"
                            disabled={profileSaving.value}
                            onClick$={async () => {
                              const tok = session.value?.user?.stoat_token;
                              if (!tok) return;
                              profileSaving.value = true;
                              profileError.value = '';
                              const ok = await editUserProfile({ display_name: editDisplayName.value || null }, tok);
                              if (ok && stoatUser.value) {
                                stoatUser.value = { ...stoatUser.value, display_name: editDisplayName.value || null };
                                editingProfile.value = false;
                              } else {
                                profileError.value = 'Failed to save changes.';
                              }
                              profileSaving.value = false;
                            }}
                          >
                            {profileSaving.value ? 'Saving…' : 'Save'}
                          </button>
                          <button class="btn-pill text-xs" onClick$={() => { editingProfile.value = false; profileError.value = ''; }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            class="btn-pill text-xs"
                            onClick$={() => { editDisplayName.value = stoatUser.value?.display_name ?? ''; editingProfile.value = true; profileError.value = ''; }}
                          >
                            <LuPencil class="inline h-3 w-3 mr-1" />Edit Profile
                          </button>
                          <button class="btn-pill" onClick$={() => signOut.submit({ redirectTo: '/chat' })}>
                            Sign Out
                          </button>
                        </>
                      )}
                    </div>
                    {profileError.value && <p class="text-red-400 text-xs mt-1">{profileError.value}</p>}
                  </div>
                </div>
              </div>

              <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16">
                This chat feature is implemented using a self-hosted <a class="text-(--color-accent) font-bold" href="https://stoat.chat" target="_blank" rel="noopener noreferrer">stoat</a> communication server.
              </p>
            </div>
          ) : (
            <div class="relative dash-left dash-right w-full p-8">
              <h2 class="text-ink text-center mb-6">Sign In / Sign Up</h2>
              <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16">
                Sign in to participate in the community chat, share insights, and collaborate.
              </p>
              <div class="flex md:flex-row flex-col pt-8">

                {/** -------- Sign in Section -------- */}
                <form
                  preventdefault:submit
                  onSubmit$={async (_, form) => {
                    signInError.value = "";
                    const formData = new FormData(form);
                    const email = formData.get("email") as string;
                    const password = formData.get("password") as string;
                    try {
                      await signIn.submit({
                        providerId: "credentials",
                        options: { email, password },
                      });
                      if (signIn.value?.failed) {
                        signInError.value = "Invalid email or password. Please try again.";
                      }
                    } catch {
                      signInError.value = "An unexpected error occurred.";
                    }
                  }}
                  class="md:w-1/2 max-md:border-b max-md:mb-4 md:border-r border-edge px-8 flex flex-col"
                >
                  <h3 class="text-ink text-xl mb-4 w-full text-center">Sign In</h3>
                  <table class="w-full text-left">
                    <tbody>
                      <tr>
                        <td><label for="email">Email</label></td>
                        <td><input type="email" id="email" name="email" class={input_style} placeholder="Email" required /></td>
                      </tr>
                      <tr>
                        <td><label for="password">Password</label></td>
                        <td class="relative">
                          <input type={showSignInPassword.value ? "text" : "password"} id="password" name="password" class={input_style + " pr-10"} placeholder="Password" required />
                          <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick$={() => showSignInPassword.value = !showSignInPassword.value}>
                            {showSignInPassword.value ? <LuEyeOff class="h-4 w-4" /> : <LuEye class="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {signInError.value && (
                    <p class="text-red-400 text-sm mt-2 text-center">{signInError.value}</p>
                  )}
                  <button type="submit" class="btn-pill mb-4 mt-2 mx-auto">Sign In</button>
                </form>
                {/** -------- Registration Section -------- */}
                <form
                  preventdefault:submit
                  onSubmit$={async (_, form) => {
                    registerError.value = "";
                    const formData = new FormData(form);
                    const email = formData.get("reg-email") as string;
                    const password = formData.get("reg-password") as string;
                    const confirmPassword = formData.get("reg-password-confirm") as string;
                    if (password !== confirmPassword) {
                      registerError.value = "Passwords do not match.";
                      return;
                    }
                    try {
                      const response = await fetch("https://chat.chemistryml.com/api/auth/account/create", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password }),
                      });
                      if (response.status === 204) {
                        form.reset();
                        regPassword.value = "";
                        regConfirmPassword.value = "";
                        await signIn.submit({
                          providerId: "credentials",
                          options: { email, password },
                        });
                      } else {
                        const data = await response.json();
                        registerError.value = data.type ?? "Registration failed. Please try again.";
                      }
                    } catch {
                      registerError.value = "An unexpected error occurred.";
                    }
                  }}
                  class="md:w-1/2 px-8 flex flex-col"
                >
                  <h3 class="text-ink text-xl mb-4 w-full text-center">Register</h3>
                  <table class="w-full text-left">
                    <tbody>
                      <tr>
                        <td><label for="reg-email">Email</label></td>
                        <td><input type="email" id="reg-email" name="reg-email" class={input_style} placeholder="Email" required /></td>
                      </tr>
                      <tr>
                        <td><label for="reg-password">Password</label></td>
                        <td class="relative">
                          <input type={showRegPassword.value ? "text" : "password"} id="reg-password" name="reg-password" class={input_style + " pr-10"} placeholder="Password" required onInput$={(_, el) => regPassword.value = el.value} />
                          <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick$={() => showRegPassword.value = !showRegPassword.value}>
                            {showRegPassword.value ? <LuEyeOff class="h-4 w-4" /> : <LuEye class="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td><label for="reg-password-confirm">Confirm Password</label></td>
                        <td class="relative">
                          <input type="password" id="reg-password-confirm" name="reg-password-confirm" class={input_style + " pr-10"} placeholder="Confirm Password" required onInput$={(_, el) => regConfirmPassword.value = el.value} />
                          {regConfirmPassword.value.length > 0 && (
                            <span class={`absolute right-2 top-1/2 -translate-y-1/2 ${regConfirmPassword.value === regPassword.value ? 'text-green-400' : 'text-red-400'}`}>
                              {regConfirmPassword.value === regPassword.value ? <LuCheck class="h-4 w-4" /> : <LuX class="h-4 w-4" />}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {registerError.value && (
                    <p class="text-red-400 text-sm mt-2 text-center">{registerError.value}</p>
                  )}
                  <button type="submit" class="btn-pill mb-4 mt-2 mx-auto">Register</button>
                </form>
              </div>
              <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16">
                This chat feature is implemented using a self-hosted <a class="text-(--color-accent) font-bold" href="https://stoat.chat" target="_blank" rel="noopener noreferrer">stoat</a> communication server.
              </p>
            </div>
          )}

          {/* --------- public list section -------- */}
          <div class="subsection-container bg-(--color-canvas)">
            <div class="corner-decor" />
            <div class="relative p-8 md:p-10">
              <div class="mb-8 text-center">
                <h3 class="text-ink mb-3">Public Servers</h3>
                <p class="text-muted max-w-2xl mx-auto">
                  Join a room to browse active discussions, ask questions, and share chemistry knowledge.
                </p>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-3 w-full border-hidden">
                {publicServers.map((room) => {
                  // Extract primitives so onClick$ does not capture the non-serializable `room` object
                  const inviteCode = (room.real && room.code) ? room.code.split('/').pop() ?? '' : '';
                  const roomTitle = room.title;
                  return (
                    <div
                      key={roomTitle}
                      class="p-1 border-dashed border-[var(--color-rim)] border-b last:border-b-0 lg:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
                    >
                      {inviteCode ? (
                        <button
                          class="p-2 w-full h-full flex items-start gap-4 cursor-pointer hover:bg-(--color-edge) transition-colors rounded-md text-left"
                          onClick$={async () => {
                            const tok = session.value?.user?.stoat_token;
                            if (!tok || !inviteCode) return;
                            try {
                              const r = await fetch(`https://chat.chemistryml.com/api/invites/${inviteCode}`, {
                                method: 'POST',
                                headers: { 'x-session-token': tok },
                              });
                              if (r.ok) {
                                const data = await r.json();
                                const sid: string = data.server?._id ?? '';
                                const sname: string = data.server?.name ?? roomTitle;
                                if (sid && !chatState.joinedServers.some((s) => s._id === sid)) {
                                  chatState.joinedServers.push({ _id: sid, name: sname, icon: data.server?.icon ?? null, banner: data.server?.banner ?? null });
                                }
                                if (sid) chatState.activeServerId = sid;
                                document.getElementById('stoat-chat-section')?.scrollIntoView({ behavior: 'smooth' });
                              }
                            } catch { /* ignore */ }
                          }}
                        >
                          <div class="shrink-0 rounded-md border border-[var(--color-rim)] bg-[var(--color-surface)] p-1.5 text-ink">
                            <room.icon class="h-8 w-8" />
                          </div>
                          <div>
                            <p class="text-ink font-medium leading-tight">{roomTitle}</p>
                            <p class="text-muted text-xs mt-1">{room.description}</p>
                          </div>
                        </button>
                      ) : (
                        <div class="p-2 w-full h-full flex items-start gap-4 opacity-50">
                          <div class="shrink-0 rounded-md border border-[var(--color-rim)] bg-[var(--color-surface)] p-1.5 text-ink">
                            <room.icon class="h-8 w-8" />
                          </div>
                          <div>
                            <p class="text-ink font-medium leading-tight">{roomTitle}</p>
                            <p class="text-muted text-xs mt-1">{room.description}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>


          </div>


          {/* -------- spacer section -------- */}
          <div class="w-full p-8 relative dash-left dash-right">
            <h2 class="text-ink text-center mb-6">Add some msc graphics</h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16 mb-8">
              Fills out the flow of the webpage with some animated svgs later, not now
            </p>
          </div>

          {session.value?.user && (
            <>

              {/* --------- private server section -------- */}
              <div class="subsection-container bg-(--color-canvas)">
                <div class="corner-decor" />
                <div class="relative p-8 md:p-10">
                  <div class="mb-8 text-center">
                    <h3 class="text-ink mb-3">Private Servers</h3>
                    <p class="text-muted max-w-2xl mx-auto">
                      Your servers. Invited servers appear dimmed - click to accept and join.
                    </p>
                  </div>

                  {!chatState.wsReady ? (
                    <p class="text-muted text-sm text-center italic py-4">Connecting to chat…</p>
                  ) : chatState.joinedServers.length === 0 ? (
                    <p class="text-muted text-sm text-center italic py-4">No private servers found.</p>
                  ) : (
                    <div class="grid grid-cols-1 lg:grid-cols-3 w-full border-hidden">

                      {/* Joined servers */}
                      {chatState.joinedServers.map((sv) => {
                        const svBannerUrl = avatarUrl(sv.banner ?? null);
                        const svId = sv._id;
                        return (
                          <div
                            key={sv._id}
                            class="p-1 border-dashed border-[var(--color-rim)] border-b last:border-b-0 lg:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
                          >
                            <button
                              class="w-full h-full cursor-pointer rounded-md text-left overflow-hidden relative group/sv"
                              style={{ minHeight: '72px' }}
                              onClick$={() => {
                                chatState.activeServerId = svId;
                                document.getElementById('stoat-chat-section')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                            >
                              {svBannerUrl ? (
                                <>
                                  <div class="absolute inset-0" style={`background: url('${svBannerUrl}') center/cover no-repeat`} />
                                  <div class="absolute inset-0 bg-gradient-to-r from-black/65 to-black/30" />
                                </>
                              ) : (
                                <div class="absolute inset-0 group-hover/sv:bg-(--color-edge) transition-colors rounded-md" />
                              )}
                              <div class="relative z-10 flex items-center gap-4 p-3">
                                <div class="shrink-0 rounded-md border border-[var(--color-rim)] bg-[var(--color-surface)] overflow-hidden w-[44px] h-[44px] flex items-center justify-center text-ink">
                                  {sv.icon
                                    ? <img src={`https://chat.chemistryml.com/autumn/${sv.icon.tag}/${sv.icon._id}`} alt={sv.name} class="w-full h-full object-cover" />
                                    : <LuServer class="h-8 w-8" />}
                                </div>
                                <div>
                                  <p class={`font-medium leading-tight ${svBannerUrl ? 'text-white' : 'text-ink'}`}>{sv.name}</p>
                                  <p class={`text-xs mt-1 ${svBannerUrl ? 'text-white/60' : 'text-muted'}`}>Click to open</p>
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })}

                      {/* Invited-but-not-joined servers */}
                      {PENDING_INVITE_CODES
                        .filter((code) => {
                          const info = fetchedInvites.value[code];
                          return !!info && !chatState.joinedServers.some((s) => s._id === info.server_id);
                        })
                        .map((code) => {
                          const info = fetchedInvites.value[code]!;
                          return (
                            <div
                              key={code}
                              class="p-1 border-dashed border-[var(--color-rim)] border-b last:border-b-0 lg:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
                            >
                              <button
                                class="p-2 w-full h-full flex items-start gap-4 cursor-pointer hover:bg-(--color-edge) transition-colors rounded-md opacity-40 text-left"
                                onClick$={async () => {
                                  const tok = session.value?.user?.stoat_token;
                                  if (!tok) return;
                                  try {
                                    const r = await fetch(`https://chat.chemistryml.com/api/invites/${code}`, {
                                      method: 'POST',
                                      headers: { 'x-session-token': tok },
                                    });
                                    if (r.ok) {
                                      const data = await r.json();
                                      const sid = (data.type === 'Server' && data.server?._id)
                                        ? String(data.server._id)
                                        : info.server_id;
                                      const sname = (data.type === 'Server' && data.server?.name)
                                        ? String(data.server.name)
                                        : info.server_name;
                                      chatState.joinedServers.push({ _id: sid, name: sname, banner: (data.type === 'Server' && data.server?.banner) ? data.server.banner : null });
                                      chatState.activeServerId = sid;
                                      document.getElementById('stoat-chat-section')?.scrollIntoView({ behavior: 'smooth' });
                                    }
                                  } catch { /* ignore */ }
                                }}
                              >
                                <div class="shrink-0 rounded-md border border-[var(--color-rim)] bg-[var(--color-surface)] p-1.5 text-ink">
                                  <LuLock class="h-8 w-8" />
                                </div>
                                <div>
                                  <p class="text-ink font-medium leading-tight">{info.server_name}</p>
                                  <p class="text-muted text-xs mt-1">Invited — click to join</p>
                                </div>
                              </button>
                            </div>
                          );
                        })
                      }

                    </div>
                  )}
                </div>

                { /* -------- direct messages section -------- */}
                <div class="relative p-8 md:p-10">
                  <div class="mb-6 text-center">
                    <h3 class="text-ink text-xl mb-3">Direct Messages</h3>
                    <p class="text-muted max-w-2xl mx-auto">Your friends and pending requests.</p>
                  </div>
                  {!chatState.wsReady ? (
                    <p class="text-muted text-sm text-center italic py-4">Connect to chat to see your friends.</p>
                  ) : (
                    <div class="flex flex-col gap-6">
                      {/* Incoming friend requests */}
                      {chatState.relations.filter(r => r.status === 'Incoming').length > 0 && (
                        <div>
                          <p class="text-muted text-xs font-bold uppercase tracking-widest mb-3">Friend Requests</p>
                          {chatState.relations.filter(r => r.status === 'Incoming').map(rel => (
                            <div key={rel._id} class="flex items-center gap-3 p-3 rounded-lg bg-(--color-surface) border border-[var(--color-rim)] mb-2">
                              <span class="flex-1 text-sm text-ink">{chatState.userNames[rel._id] ?? rel._id}</span>
                              <button
                                class="btn-pill text-xs px-4 py-1.5"
                                onClick$={async () => {
                                  const tok = session.value?.user?.stoat_token;
                                  if (!tok) return;
                                  const ok = await acceptFriendRequest(rel._id, tok);
                                  if (ok) {
                                    chatState.relations = chatState.relations.map(
                                      r => r._id === rel._id ? { ...r, status: 'Friend' } : r
                                    );
                                    chatState.activeDmUserId = rel._id;
                                    chatState.activeDmSeq = (chatState.activeDmSeq ?? 0) + 1;
                                    document.getElementById('stoat-chat-section')?.scrollIntoView({ behavior: 'smooth' });
                                  }
                                }}
                              >
                                Accept
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Friends grid */}
                      {chatState.relations.filter(r => r.status === 'Friend').length === 0 &&
                          chatState.relations.filter(r => r.status === 'Incoming').length === 0 ? (
                        <p class="text-muted text-sm text-center italic py-4">No friends yet — join a server and use the members sidebar to add people.</p>
                      ) : (
                        <div class="grid grid-cols-1 lg:grid-cols-3 w-full">
                          {chatState.relations.filter(r => r.status === 'Friend').map(rel => (
                            <div key={rel._id} class="p-1">
                              <button
                                class="w-full h-full cursor-pointer rounded-md text-left overflow-hidden relative group/dm"
                                style={{ minHeight: '72px' }}
                                onClick$={() => {
                                  chatState.activeDmUserId = rel._id;
                                  chatState.activeDmSeq = (chatState.activeDmSeq ?? 0) + 1;
                                  document.getElementById('stoat-chat-section')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                              >
                                {friendBanners.value[rel._id] ? (
                                  <>
                                    <div class="absolute inset-0" style={`background: url('${friendBanners.value[rel._id]}') center/cover no-repeat`} />
                                    <div class="absolute inset-0 bg-gradient-to-r from-black/65 to-black/30" />
                                  </>
                                ) : (
                                  <div class="absolute inset-0 group-hover/dm:bg-(--color-edge) transition-colors rounded-md" />
                                )}
                                <div class="relative z-10 flex items-center gap-3 p-3">
                                  <div class={`shrink-0 rounded-full overflow-hidden w-[44px] h-[44px] flex items-center justify-center ${friendBanners.value[rel._id] ? 'border border-white/30' : 'border border-[var(--color-rim)] bg-[var(--color-surface)]'}`}>
                                    {chatState.userAvatars[rel._id]
                                      ? <img src={chatState.userAvatars[rel._id]} alt="" class="w-full h-full object-cover" />
                                      : <LuUser class={`h-7 w-7 ${friendBanners.value[rel._id] ? 'text-white' : 'text-ink'}`} />}
                                  </div>
                                  <div>
                                    <p class={`font-medium leading-tight ${friendBanners.value[rel._id] ? 'text-white' : 'text-ink'}`}>
                                      {chatState.userNames[rel._id] ?? rel._id}
                                    </p>
                                    <p class={`text-xs mt-0.5 ${friendBanners.value[rel._id] ? 'text-white/60' : 'text-muted'}`}>Click to message</p>
                                  </div>
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* -------- spacer section -------- */}
              <div class="w-full p-8 relative dash-left dash-right">

                <h2 class="text-ink text-center mb-6">Add some msc graphics</h2>
                <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16 mb-8">
                  Fills out the flow of the webpage with some animated svgs later, not now

                </p>
              </div>
            </>
          )}
        </div>
        <div class="section-padding dash-right" />
      </section>


      <section class="relative section-container flex flex-row">

        {session.value?.user?.stoat_token && (
          <div id="stoat-chat-section" class="dash-left dash-right relative p-[1px] w-full">
            <StoatChat token={session.value.user.stoat_token} chatState={chatState} />
          </div>
        )}
      </section>
      <section class="relative section-container flex flex-row">
        <div class="section-padding dash-left" >
          <div class="absolute -inset-[2px] z-20 bg-gradient-to-b from-transparent to-(--color-surface) pointer-events-none" />
        </div>
        <div class="flex flex-col w-[var(--inner-width)] max-w-[100vw] mx-auto">
          <div class="relative dash-left dash-right w-full p-8 flex flex-col items-center">
            <h2 class="text-ink text-center mb-6">Please be kind and professional</h2>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16">
              This is a community space to share knowledge, ask questions, and collaborate.
            </p>
            <p class="text-muted font-semibold text-lg max-w-2xl mx-auto px-2 md:px-16 mt-3">
              Please be respectful, avoid sharing sensitive information, and follow good etiquette.
            </p>
          </div>
        </div>
        <div class="section-padding dash-right" >
          <div class="absolute -inset-[2px] z-20 bg-gradient-to-b from-transparent to-(--color-surface) pointer-events-none" />
        </div>
      </section>
    </div>
  );
});

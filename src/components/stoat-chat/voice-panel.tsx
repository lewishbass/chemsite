import {
  component$,
  useSignal,
  useVisibleTask$,
  useStore,
  $,
  useId,
  type NoSerialize,
  type QRL,
  noSerialize,
} from '@builder.io/qwik';
import {
  LuHeadphones,
  LuMic,
  LuMicOff,
  LuVolume2,
  LuVolumeX,
  LuPhoneOff,
  LuCamera,
  LuCameraOff,
  LuScreenShare,
  LuScreenShareOff,
} from '@qwikest/icons/lucide';
import {
  joinVoiceChannel,
  updateMyVoiceState,
  type StoatChatState,
} from './stoat_scripts';
import {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type Participant,
  type TrackPublication,
} from 'livekit-client';

// ── Layout constants ──────────────────────────────────────────────────────────
const VIDEO_SIZE = 400;
const NO_VIDEO_SIZE = 150;
const FOCUSED_VIDEO_SIZE = 600;

// ── Types ──────────────────────────────────────────────────────────────────

interface VoicePanelProps {
  channelId: string;
  channelName: string;
  chatState: StoatChatState;
  token: string;
  onToggleConnect: QRL<() => void>;
}

interface TileParticipant {
  id: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  videoEnabled: boolean;
  avatar?: string;
}

// ── Merge LiveKit participants + server voice state into tiles ────────────

function buildParticipants(
  chatState: StoatChatState,
  localUserId: string,
  activeSpeakers: Set<string>,
): TileParticipant[] {
  const tiles: TileParticipant[] = [];

  // Add local user first
  const localName = chatState.userNames[localUserId] ?? 'You';
  const localState = chatState.voiceParticipants[localUserId];
  tiles.push({
    id: localUserId,
    name: localName,
    isLocal: true,
    speaking: activeSpeakers.has(localUserId),
    muted: localState?.mute ?? false,
    deafened: localState?.deaf ?? false,
    videoEnabled: localState?.video ?? false,
    avatar: chatState.userAvatars[localUserId],
  });

  // Add remote participants from voice state
  for (const [uid, state] of Object.entries(chatState.voiceParticipants)) {
    if (uid === localUserId) continue;
    tiles.push({
      id: uid,
      name: chatState.userNames[uid] ?? uid.slice(0, 8),
      isLocal: false,
      speaking: activeSpeakers.has(uid),
      muted: state.mute,
      deafened: state.deaf,
      videoEnabled: state.video,
      avatar: chatState.userAvatars[uid],
    });
  }

  return tiles;
}

// ── ParticipantTile ───────────────────────────────────────────────────────────

interface ParticipantTileProps {
  participant: TileParticipant;
  compId: string;
  /** true when this tile is currently focused/expanded */
  isFocused: boolean;
  onFocus$: QRL<(id: string | null) => void>;
}

/**
 * A single voice-channel participant tile.
 *
 * Sizing — same *area* per category so every tile looks equally large
 * regardless of individual video aspect ratio:
 *   no_video  – fixed compact size (4:3)
 *   video     – area = VIDEO_SIZE²,         w/h derived from actual video ratio
 *   focused   – area = FOCUSED_VIDEO_SIZE², same derivation
 *
 * The component observes its own container for <video> elements inserted by
 * VoicePanel's LiveKit track subscription handlers, reads their intrinsic
 * dimensions, and keeps the displayed aspect ratio in sync.
 */
const ParticipantTile = component$<ParticipantTileProps>(
  ({ participant: p, compId, isFocused, onFocus$ }) => {
    const aspectRatio = useSignal(16 / 9);
    const tileId = `${compId}-tile-${p.id}`;

    // ── Watch for video elements inserted into this tile ────────────
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ cleanup }) => {
      const tileEl = document.getElementById(tileId);
      if (!tileEl) return;

      let vidCleanup: (() => void) | null = null;

      const attachToVideo = (vidEl: HTMLVideoElement) => {
        vidCleanup?.();
        const update = () => {
          if (vidEl.videoWidth > 0 && vidEl.videoHeight > 0) {
            aspectRatio.value = vidEl.videoWidth / vidEl.videoHeight;
          }
        };
        if (vidEl.readyState >= HTMLMediaElement.HAVE_METADATA && vidEl.videoWidth > 0) {
          update();
        } else {
          vidEl.addEventListener('loadedmetadata', update, { once: true });
        }
        // Fires when decoded resolution changes (e.g. simulcast layer switch)
        vidEl.addEventListener('resize', update);
        vidCleanup = () => vidEl.removeEventListener('resize', update);
      };

      const existing = tileEl.querySelector('video') as HTMLVideoElement | null;
      if (existing) attachToVideo(existing);

      // Catch videos dynamically appended by LiveKit track handlers
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLVideoElement) attachToVideo(node);
          }
        }
      });
      observer.observe(tileEl, { childList: true });

      cleanup(() => {
        observer.disconnect();
        vidCleanup?.();
      });
    });

    // ── Tile dimensions ─────────────────────────────────────────────
    // Equal area per size-class: w = √(A·r), h = √(A/r)
    const r = aspectRatio.value;
    let tileW: number;
    let tileH: number;

    if (isFocused && p.videoEnabled) {
      const A = FOCUSED_VIDEO_SIZE * FOCUSED_VIDEO_SIZE;
      tileW = Math.round(Math.sqrt(A * r));
      tileH = Math.round(Math.sqrt(A / r));
    } else if (p.videoEnabled) {
      const A = VIDEO_SIZE * VIDEO_SIZE;
      tileW = Math.round(Math.sqrt(A * r));
      tileH = Math.round(Math.sqrt(A / r));
    } else if (isFocused) {
      tileW = Math.round(NO_VIDEO_SIZE * (4 / 3) * 1.5);
      tileH = Math.round(NO_VIDEO_SIZE * 1.5);
    } else {
      tileW = Math.round(NO_VIDEO_SIZE * (4 / 3));
      tileH = NO_VIDEO_SIZE;
    }

    return (
      <div
        id={tileId}
        onClick$={() => onFocus$(isFocused ? null : p.id)}
        class={[
          'relative rounded-lg overflow-hidden border-2 transition-all duration-300 cursor-pointer',
          'flex items-center justify-center',
          p.speaking
            ? 'border-green-500/70 ring-1 ring-green-500/30'
            : isFocused
              ? 'border-blue-500/70 ring-1 ring-blue-500/30'
              : 'border-(--color-rim)',
          p.videoEnabled ? 'video-active-tile' : '',
        ].join(' ')}
        style={{
          width: `${tileW}px`,
          height: `${tileH}px`,
          minWidth: `${tileW}px`,
          minHeight: `${tileH}px`,
          flexShrink: 0,
        }}
      >
        {/* Base layer: avatar + name (visible when no video) */}
        <div
          class={[
            'flex flex-col items-center gap-2 py-3 transition-opacity duration-300',
            p.videoEnabled ? 'opacity-0 absolute pointer-events-none' : 'voice-no-video',
          ].join(' ')}
        >
          <div
            class={[
              'w-22 h-22 rounded-full flex items-center justify-center text-lg font-bold transition-colors',
              p.speaking ? 'bg-green-500/20 text-green-400' : 'bg-(--color-rim) text-muted',
            ].join(' ')}
          >
            {p.avatar ? (
              <img
                src={p.avatar}
                alt={p.name}
                width={48}
                height={48}
                class="w-full h-full rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              p.name.charAt(0).toUpperCase()
            )}
          </div>
          <span class="text-xs text-muted truncate max-w-[90px] text-center">
            {p.name}
            {p.isLocal ? ' (You)' : ''}
          </span>
        </div>

        {/* Video overlay: small avatar top-left, name tag top-right */}
        {p.videoEnabled && (
          <>
            <div class="absolute top-2 left-2 z-10">
              <div class="w-7 h-7 rounded-full bg-(--color-rim) flex items-center justify-center text-xs font-bold text-white ring-1 ring-black/30 overflow-hidden">
                {p.avatar ? (
                  <img
                    src={p.avatar}
                    alt={p.name}
                    width={28}
                    height={28}
                    class="w-full h-full rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  p.name.charAt(0).toUpperCase()
                )}
              </div>
            </div>
            <div class="absolute top-2 right-2 z-10 bg-black/50 rounded px-1.5 py-0.5">
              <span class="text-[10px] text-white/90 truncate max-w-[80px] block">
                {p.name}
              </span>
            </div>
          </>
        )}

        {/* Muted badge */}
        {p.muted && !p.videoEnabled && (
          <LuMicOff class="h-5 w-5 text-red-500/80 absolute top-1.5 right-1.5" />
        )}
        {p.muted && p.videoEnabled && (
          <LuMicOff class="h-5 w-5 text-red-500/80 absolute bottom-1.5 right-1.5" />
        )}

        {/* Deafened badge */}
        {p.deafened && !p.videoEnabled && (
          <div class="absolute top-1.5 left-1.5 bg-orange-500/80 rounded-full p-0.5">
            <LuVolumeX class="h-3 w-3 text-white" />
          </div>
        )}
        {p.deafened && p.videoEnabled && (
          <div class="absolute bottom-1.5 left-1.5 bg-orange-500/80 rounded-full p-0.5">
            <LuVolumeX class="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    );
  },
);

// ── Component ─────────────────────────────────────────────────────────────

export const VoicePanel = component$<VoicePanelProps>(
  ({ channelId, channelName, chatState, token, onToggleConnect }) => {
    const compId = useId();

    // ── Internal state ──────────────────────────────────────────────────
    const room = useSignal<NoSerialize<Room> | null>(null);
    const localAudioTrack = useSignal<NoSerialize<LocalAudioTrack> | null>(null);
    const localVideoTrack = useSignal<NoSerialize<LocalVideoTrack> | null>(null);
    const localMicEnabled = useSignal(true);
    const localVideoEnabled = useSignal(false);
    const localDeafened = useSignal(false);
    const screenSharing = useSignal(false);
    const activeSpeakers = useStore<Record<string, boolean>>({});
    const participantTiles = useSignal<TileParticipant[]>([]);

    const focusedUser = useSignal<string | null>(null);

    // Derive connection state from chatState so useVisibleTask$ can track() it
    const connected = useSignal(false);
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track, cleanup }) => {
      const activeVcId = track(() => chatState.activeVoiceChannelId);
      const currentChId = track(() => channelId);
      connected.value = activeVcId === currentChId && activeVcId !== '';
      cleanup(() => {}); // no cleanup needed
    });

    // ── Derive participant tiles ────────────────────────────────────────
    useVisibleTask$(({ track }) => {
      track(() => chatState.voiceParticipants);
      track(() => chatState.userNames);
      track(() => chatState.userAvatars);
      track(() => chatState.currentUserId);
      // Track activeSpeakers by reading all entries inside track()
      const speakerSet = track(() => {
        const set = new Set<string>();
        for (const [id, speaking] of Object.entries(activeSpeakers)) {
          if (speaking) set.add(id);
        }
        return set;
      });

      participantTiles.value = buildParticipants(
        chatState,
        chatState.currentUserId,
        speakerSet,
      );
    });

    // ── LiveKit connection lifecycle ─────────────────────────────────────
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track, cleanup }) => {
      const isNowConnected = track(() => connected.value);
      const chId = track(() => channelId);

      if (!isNowConnected || !chId || !token) {
        if (room.value) {
          (room.value as unknown as Room).disconnect().catch(() => {});
          room.value = null;
        }
        localAudioTrack.value = null;
        localVideoTrack.value = null;
        localMicEnabled.value = true;
        localVideoEnabled.value = false;
        localDeafened.value = false;
        screenSharing.value = false;
        for (const k of Object.keys(activeSpeakers)) activeSpeakers[k] = false;
        return;
      }

      let destroyed = false;

      const run = async () => {
        try {
          // 1. Get LiveKit credentials from Stoat delta API
          const joinRes = await joinVoiceChannel(chId, token);
          if (!joinRes || destroyed) return;
          chatState.liveKitUrl = joinRes.url;
          chatState.liveKitToken = joinRes.token;

          // 2. Create the LiveKit Room
          const r = new Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
              resolution: { width: 640, height: 480 },
            },
          });

          // Catch all events that prints to console for debugging
          for (const evt of Object.values(RoomEvent)) {
            r.on(evt as string, (...args: any[]) => {
              if(evt === RoomEvent.ActiveSpeakersChanged) return; // too noisy
              console.log(`[LiveKit Room] ${evt}`, ...args);
            });
          }

          // ── Room event: Connected ───────────────────────────────────
          r.on(RoomEvent.Connected, () => {
            const myId = chatState.currentUserId;
            chatState.voiceParticipants = {
              ...chatState.voiceParticipants,
              [myId]: {
                user_id: myId,
                mute: false,
                deaf: false,
                video: false,
                self_mute: false,
                self_deaf: false,
              },
            };
          });

          // ── Room event: Disconnected ────────────────────────────────
          r.on(RoomEvent.Disconnected, () => {
            if (destroyed) return;
            const myId = chatState.currentUserId;
            const rest = { ...chatState.voiceParticipants };
            delete rest[myId];
            chatState.voiceParticipants = rest;
            // Remove all remote media elements created for this room session.
            document
              .querySelectorAll(`[id^="${compId}-remote-"]`)
              .forEach((el) => el.remove());
          });

          // ── Room event: Remote participant joined ───────────────────
          r.on(
            RoomEvent.ParticipantConnected,
            (participant: RemoteParticipant) => {
              const uid = participant.identity;
              if (!chatState.voiceParticipants[uid]) {
                chatState.voiceParticipants = {
                  ...chatState.voiceParticipants,
                  [uid]: {
                    user_id: uid,
                    mute: false,
                    deaf: false,
                    video: false,
                    self_mute: false,
                    self_deaf: false,
                  },
                };
              }
            },
          );

          // ── Room event: Participant active (ready for data) ─────────
          r.on(
            RoomEvent.ParticipantActive,
            (participant: Participant) => {
              const uid = participant.identity;
              // Ensure participant is in voice state; they may already be from ParticipantConnected
              if (!chatState.voiceParticipants[uid]) {
                chatState.voiceParticipants = {
                  ...chatState.voiceParticipants,
                  [uid]: {
                    user_id: uid,
                    mute: false,
                    deaf: false,
                    video: false,
                    self_mute: false,
                    self_deaf: false,
                  },
                };
              }
            },
          );

          // ── Room event: Participant permissions changed ─────────────
          r.on(
            RoomEvent.ParticipantPermissionsChanged,
            (...args: any[]) => {
              // Permissions changed — ensure their tile exists
              const participant: Participant = args[args.length - 1];
              const uid = participant.identity;
              if (!chatState.voiceParticipants[uid]) {
                chatState.voiceParticipants = {
                  ...chatState.voiceParticipants,
                  [uid]: {
                    user_id: uid,
                    mute: false,
                    deaf: false,
                    video: false,
                    self_mute: false,
                    self_deaf: false,
                  },
                };
              }
            },
          );

          // ── Room event: Remote participant left ─────────────────────
          r.on(
            RoomEvent.ParticipantDisconnected,
            (participant: RemoteParticipant) => {
              const uid = participant.identity;
              // Remove all media elements for this participant
              document
                .querySelectorAll(`[id^="${compId}-remote-${uid}-"]`)
                .forEach((el) => el.remove());
              const rest = { ...chatState.voiceParticipants };
              delete rest[uid];
              chatState.voiceParticipants = rest;
              activeSpeakers[uid] = false;
            },
          );

          // ── Room event: Remote participant audio muted ────────────
          r.on(
            RoomEvent.TrackMuted,
            (
              publication: TrackPublication,
              participant: Participant,
            ) => {
              if (publication.kind !== Track.Kind.Audio) return;
              const uid = participant.identity;
              const existing = chatState.voiceParticipants[uid];
              if (existing) {
                chatState.voiceParticipants = {
                  ...chatState.voiceParticipants,
                  [uid]: { ...existing, mute: true },
                };
              }
            },
          );

          // ── Room event: Remote participant audio unmuted ──────────
          r.on(
            RoomEvent.TrackUnmuted,
            (
              publication: TrackPublication,
              participant: Participant,
            ) => {
              if (publication.kind !== Track.Kind.Audio) return;
              const uid = participant.identity;
              const existing = chatState.voiceParticipants[uid];
              if (existing) {
                chatState.voiceParticipants = {
                  ...chatState.voiceParticipants,
                  [uid]: { ...existing, mute: false },
                };
              }
            },
          );

          // ── Room event: Media track subscribed (remote) ─────────────
          r.on(
            RoomEvent.TrackSubscribed,
            (
              track: RemoteTrack,
              _publication: RemoteTrackPublication,
              _participant: RemoteParticipant,
            ) => {
              const uid = _participant.identity;
              const kind = track.kind;
              const elId = `${compId}-remote-${uid}-${kind}`;

              // Ensure this participant exists in voice state.
              // This handles participants who were already in the room before we joined
              // since ParticipantConnected only fires for participants who join after us.
              if (!chatState.voiceParticipants[uid]) {
                chatState.voiceParticipants = {
                  ...chatState.voiceParticipants,
                  [uid]: {
                    user_id: uid,
                    mute: _publication.isMuted,
                    deaf: false,
                    video: false,
                    self_mute: false,
                    self_deaf: false,
                  },
                };
              }

              if (kind === Track.Kind.Audio) {
                // Attach audio to a hidden <audio> element
                let container = document.getElementById(elId) as HTMLAudioElement | null;
                if (!container) {
                  container = document.createElement('audio');
                  container.id = elId;
                  container.style.display = 'none';
                  document.body.appendChild(container);
                }
                track.attach(container);
              } else if (kind === Track.Kind.Video) {
                // Mark participant as having video so their tile switches to video layout.
                // Do this before attempting DOM attachment so Qwik re-renders the tile.
                const vp = chatState.voiceParticipants[uid];
                if (vp && !vp.video) {
                  chatState.voiceParticipants = {
                    ...chatState.voiceParticipants,
                    [uid]: { ...vp, video: true },
                  };
                }

                // Attach video into the participant's tile. The tile may not be in the DOM
                // yet if we just added this participant above; retry with rAF to allow
                // Qwik to render the tile before we attempt to append the video element.
                const attachVideoToTile = (attemptsLeft: number) => {
                  const tileEl = document.getElementById(`${compId}-tile-${uid}`);
                  if (tileEl) {
                    if (!document.getElementById(elId)) {
                      const el = track.attach() as HTMLVideoElement;
                      el.id = elId;
                      el.className =
                        'max-w-full max-h-full object-contain rounded-lg absolute inset-0 w-full h-full';
                      el.style.maxWidth = '100%';
                      el.style.maxHeight = '100%';
                      tileEl.appendChild(el);
                    }
                  } else if (attemptsLeft > 0) {
                    requestAnimationFrame(() => attachVideoToTile(attemptsLeft - 1));
                  }
                };
                attachVideoToTile(20);
              }
            },
          );

          // ── Room event: Media track unsubscribed ────────────────────
          r.on(
            RoomEvent.TrackUnsubscribed,
            (
              track: RemoteTrack,
              _publication: RemoteTrackPublication,
              _participant: RemoteParticipant,
            ) => {
              const uid = _participant.identity;
              const kind = track.kind;
              const elId = `${compId}-remote-${uid}-${kind}`;

              // detach() returns all elements the track was attached to; remove them.
              track.detach().forEach((el) => el.remove());
              // Belt-and-suspenders: also remove by known ID.
              document.getElementById(elId)?.remove();

              if (kind === Track.Kind.Video) {
                const vp = chatState.voiceParticipants[uid];
                if (vp) {
                  chatState.voiceParticipants = {
                    ...chatState.voiceParticipants,
                    [uid]: { ...vp, video: false },
                  };
                }
              }
            },
          );

          // ── Room event: Active speakers changed ─────────────────────
          r.on(
            RoomEvent.ActiveSpeakersChanged,
            (speakers: Participant[]) => {
              // Set all known participants to false first (avoids delete which Qwik proxies may not track)
              for (const k of Object.keys(activeSpeakers)) {
                activeSpeakers[k] = false;
              }
              // Then mark the actively speaking ones
              for (const s of speakers) {
                activeSpeakers[s.identity] = true;
              }
            },
          );

          // 3. Connect to LiveKit
          await r.connect(joinRes.url, joinRes.token);
          if (destroyed) {
            r.disconnect().catch(() => {});
            return;
          }
          room.value = noSerialize(r as unknown as Room);

          // 4. Publish local microphone audio using LiveKit's helper
          try {
            await r.localParticipant.setMicrophoneEnabled(true);
            const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (pub?.track) {
              localAudioTrack.value = noSerialize(pub.track as unknown as LocalAudioTrack);
            }

            // Update voice state: we're now in the channel
            const myId = chatState.currentUserId;
            if (chatState.voiceParticipants[myId]) {
              chatState.voiceParticipants = {
                ...chatState.voiceParticipants,
                [myId]: {
                  ...chatState.voiceParticipants[myId],
                  video: false,
                },
              };
            }
          } catch {
            // Mic permission denied — user can toggle later
          }
        } catch (err) {
          console.error('Voice panel: failed to connect', err);
        }
      };

      run();

      cleanup(() => {
        destroyed = true;
        // Remove all media elements we injected into the DOM for this session.
        document
          .querySelectorAll(`[id^="${compId}-remote-"]`)
          .forEach((el) => el.remove());
        document.getElementById(`${compId}-local-video`)?.remove();
        document.getElementById(`${compId}-local-screen`)?.remove();
        if (room.value) {
          (room.value as unknown as Room).disconnect().catch(() => {});
        }
        room.value = null;
        localAudioTrack.value = null;
        localVideoTrack.value = null;
        localMicEnabled.value = true;
        localVideoEnabled.value = false;
        localDeafened.value = false;
        screenSharing.value = false;
      });
    });

    // ── Mic toggle ──────────────────────────────────────────────────────
    const toggleMic = $(async () => {
      const r = room.value as unknown as Room | null;
      if (!r) return;
      const newMuted = !localMicEnabled.value;
      localMicEnabled.value = newMuted;

      // Use LiveKit's setMicrophoneEnabled which toggles the track without destroying it
      // localMicEnabled mirrors the LiveKit enabled state (true = mic on, not muted)
      await r.localParticipant.setMicrophoneEnabled(localMicEnabled.value);

      // Keep a reference to the track for downstream use
      if (localMicEnabled.value) {
        const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (pub?.track) {
          localAudioTrack.value = noSerialize(pub.track as unknown as LocalAudioTrack);
        }
      }

      await updateMyVoiceState(channelId, { mute: !localMicEnabled.value }, token);
      const uid = chatState.currentUserId;
      const existing = chatState.voiceParticipants[uid];
      if (existing) {
        chatState.voiceParticipants = {
          ...chatState.voiceParticipants,
          [uid]: { ...existing, mute: !localMicEnabled.value, self_mute: !localMicEnabled.value },
        };
      }
    });

    // ── Deafen toggle ───────────────────────────────────────────────────
    const toggleDeaf = $(async () => {
      const roomRef = room.value as unknown as Room | null;
      const newDeaf = !localDeafened.value;
      localDeafened.value = newDeaf;

      if (newDeaf && roomRef) {
        await roomRef.localParticipant.setMicrophoneEnabled(false);
        localMicEnabled.value = false;
      }

      await updateMyVoiceState(channelId, { deaf: newDeaf }, token);
      const uid = chatState.currentUserId;
      const existing = chatState.voiceParticipants[uid];
      if (existing) {
        chatState.voiceParticipants = {
          ...chatState.voiceParticipants,
          [uid]: { ...existing, deaf: newDeaf, self_deaf: newDeaf },
        };
      }
    });

    // ── Camera toggle ───────────────────────────────────────────────────
    const toggleVideo = $(async () => {
      const r = room.value as unknown as Room | null;
      if (!r) return;
      const newEnabled = !localVideoEnabled.value;
      localVideoEnabled.value = newEnabled;

      const uid = chatState.currentUserId;
      const tileId = `${compId}-tile-${uid}`;
      const elId = `${compId}-local-video`;

      if (newEnabled) {
        try {
          const video = await createLocalVideoTrack({
            resolution: { width: 640, height: 480 },
          });
          await r.localParticipant.publishTrack(video, {
            name: 'camera',
            source: Track.Source.Camera,
          });
          localVideoTrack.value = noSerialize(
            video as unknown as LocalVideoTrack,
          );

          // Attach local video to the local tile
          const tileEl2 = document.getElementById(tileId);
          if (tileEl2) {
            const existingVid = document.getElementById(elId);
            if (!existingVid) {
              const vidEl = video.attach() as HTMLVideoElement;
              vidEl.id = elId;
              vidEl.className =
                'max-w-full max-h-full object-contain rounded-lg absolute inset-0 w-full h-full';
              vidEl.style.maxWidth = '100%';
              vidEl.style.maxHeight = '100%';
              tileEl2.appendChild(vidEl);
            }
          }
        } catch {
          /* permission denied */
        }
      } else {
        const track = localVideoTrack.value as unknown as LocalVideoTrack | null;
        if (track) {
          track.detach();
          await r.localParticipant.unpublishTrack(track.mediaStreamTrack);
          track.stop();
          localVideoTrack.value = null;
        }
        // Remove the local video element from the DOM
        const vidEl = document.getElementById(elId);
        if (vidEl) vidEl.remove();
      }

      await updateMyVoiceState(channelId, { video: newEnabled }, token);
      const existing = chatState.voiceParticipants[uid];
      if (existing) {
        chatState.voiceParticipants = {
          ...chatState.voiceParticipants,
          [uid]: { ...existing, video: newEnabled },
        };
      }
    });

    // ── Screen share toggle ─────────────────────────────────────────────
    const toggleScreenShare = $(async () => {
      const r = room.value as unknown as Room | null;
      if (!r) return;
      const uid = chatState.currentUserId;
      const tileId = `${compId}-tile-${uid}`;
      const screenElId = `${compId}-local-screen`;

      if (screenSharing.value) {
        // Use LiveKit's API to properly unpublish and tear down the screen share track,
        // which ensures the WebRTC peer connection is renegotiated cleanly.
        await r.localParticipant.setScreenShareEnabled(false);
        screenSharing.value = false;
        localVideoTrack.value = null;

        // Remove screen share video element
        const screenEl = document.getElementById(screenElId);
        if (screenEl) screenEl.remove();

        // Reset tile layout: show camera if it was on, otherwise go to audio-only
        const vpUid = chatState.voiceParticipants[uid];
        if (vpUid) {
          chatState.voiceParticipants = {
            ...chatState.voiceParticipants,
            [uid]: { ...vpUid, video: localVideoEnabled.value },
          };
        }

        if (localVideoEnabled.value) {
          try {
            const video = await createLocalVideoTrack({
              resolution: { width: 640, height: 480 },
            });
            await r.localParticipant.publishTrack(video, {
              name: 'camera',
              source: Track.Source.Camera,
            });
            localVideoTrack.value = noSerialize(
              video as unknown as LocalVideoTrack,
            );
          } catch {
            /* ignore */
          }
        }
      } else {
        try {
          // Unpublish camera if active before starting screen share
          const camTrack = localVideoTrack.value as unknown as LocalVideoTrack | null;
          if (camTrack) {
            await r.localParticipant.unpublishTrack(camTrack.mediaStreamTrack);
            camTrack.stop();
            localVideoTrack.value = null;
          }

          // Use LiveKit's setScreenShareEnabled instead of manually calling getDisplayMedia.
          // This ensures the DataChannels (lossy/reliable) survive the peer connection
          // renegotiation that adding a new track triggers.
          const screenPub = await r.localParticipant.setScreenShareEnabled(true, { audio: false });
          // screenPub is undefined if the user cancelled the browser picker
          if (!screenPub) {
            // Restore camera track reference if we unpublished it above
            if (localVideoEnabled.value) {
              const camPub = r.localParticipant.getTrackPublication(Track.Source.Camera);
              if (camPub?.track) {
                localVideoTrack.value = noSerialize(camPub.track as unknown as LocalVideoTrack);
              }
            }
            return;
          }

          const screenTrack = screenPub.track;
          if (!screenTrack) return;

          const nativeTrack = screenTrack.mediaStreamTrack;
          screenSharing.value = true;
          localVideoTrack.value = noSerialize(screenTrack as unknown as LocalVideoTrack);

          // Attach local screen preview to the participant tile
          const tileEl3 = document.getElementById(tileId);
          if (tileEl3 && !document.getElementById(screenElId)) {
            const sEl = document.createElement('video');
            sEl.id = screenElId;
            sEl.className =
              'max-w-full max-h-full object-contain rounded-lg absolute inset-0 w-full h-full';
            sEl.style.maxWidth = '100%';
            sEl.style.maxHeight = '100%';
            sEl.srcObject = new MediaStream([nativeTrack]);
            sEl.autoplay = true;
            sEl.playsInline = true;
            sEl.muted = true;
            tileEl3.appendChild(sEl);
          }

          // Update voice state so tile switches to video layout
          const existingVp = chatState.voiceParticipants[uid];
          if (existingVp) {
            chatState.voiceParticipants = {
              ...chatState.voiceParticipants,
              [uid]: { ...existingVp, video: true },
            };
          }

          // When the user clicks "Stop sharing" in the browser's native UI, the
          // MediaStreamTrack ends. We must unpublish it via LiveKit so the peer
          // connection is renegotiated cleanly — omitting this was the root cause of
          // the "Unknown DataChannel error on lossy/reliable" that broke the connection.
          nativeTrack.addEventListener('ended', () => {
            screenSharing.value = false;
            localVideoTrack.value = null;
            document.getElementById(screenElId)?.remove();
            r.localParticipant.setScreenShareEnabled(false).catch(() => {});
            const st = chatState.voiceParticipants[uid];
            if (st) {
              chatState.voiceParticipants = {
                ...chatState.voiceParticipants,
                [uid]: { ...st, video: localVideoEnabled.value },
              };
            }
          }, { once: true });
        } catch {
          /* user cancelled or permission denied */
        }
      }
    });

    // ── Focus handler ───────────────────────────────────────────────────
    const handleFocus = $((id: string | null) => {
      focusedUser.value = id;
    });

    // ── Participants array for rendering ───────────────────────────────
    const tiles = participantTiles.value;

    return (
      <div class="flex flex-col h-content bg-(--color-canvas)/30">
        {/* ── Empty state (not connected) ── */}
        {!connected.value ? (
          <div class="flex-1 flex items-center justify-center flex-col gap-3 p-6">
            <div class="w-16 h-16 rounded-full bg-(--color-edge) flex items-center justify-center">
              <LuHeadphones class="h-7 w-7 text-muted" />
            </div>
            <p class="text-muted text-sm text-center">
              Not connected to a voice channel
            </p>
            <button
              class="px-4 py-1.5 rounded-full bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors cursor-pointer"
              onClick$={onToggleConnect}
            >
              Join {channelName || 'Voice'}
            </button>
          </div>
        ) : (
          <>
            {/* ── Connected header ── */}
            <div class="shrink-0 px-3 py-1.5 flex items-center gap-2 border-b border-(--color-rim) bg-(--color-surface)/50">
              <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span class="text-xs text-muted font-medium">
                Connected — {tiles.length} participant
                {tiles.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Participant tiles (flex row, wrap on overflow) ── */}
            <div
              class="flex-1 flex flex-row flex-wrap gap-2 p-3 overflow-y-auto content-start"
            >
              {tiles.map((p) => (
                <ParticipantTile
                  key={p.id}
                  participant={p}
                  compId={compId}
                  isFocused={focusedUser.value === p.id}
                  onFocus$={handleFocus}
                />
              ))}
            </div>

            {/* ── Controls bar ── */}
            <div class="shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 border-t border-(--color-rim) bg-(--color-surface)">
              {/* Mic toggle */}
              <button
                class={[
                  'p-2 rounded-full transition-colors cursor-pointer',
                  localMicEnabled.value
                    ? 'text-muted hover:text-ink hover:bg-(--color-edge)'
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
                ].join(' ')}
                title={
                  localMicEnabled.value
                    ? 'Mute microphone'
                    : 'Unmute microphone'
                }
                onClick$={toggleMic}
              >
                {localMicEnabled.value ? (
                  <LuMic class="h-4 w-4" />
                ) : (
                  <LuMicOff class="h-4 w-4" />
                )}
              </button>

              {/* Deafen toggle */}
              <button
                class={[
                  'p-2 rounded-full transition-colors cursor-pointer',
                  localDeafened.value
                    ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                    : 'text-muted hover:text-ink hover:bg-(--color-edge)',
                ].join(' ')}
                title={
                  localDeafened.value ? 'Undeafen' : 'Deafen'
                }
                onClick$={toggleDeaf}
              >
                {localDeafened.value ? (
                  <LuVolumeX class="h-4 w-4" />
                ) : (
                  <LuVolume2 class="h-4 w-4" />
                )}
              </button>

              {/* Camera toggle */}
              <button
                class={[
                  'p-2 rounded-full transition-colors cursor-pointer',
                  localVideoEnabled.value
                    ? 'text-muted hover:text-ink hover:bg-(--color-edge)'
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
                ].join(' ')}
                title={
                  localVideoEnabled.value
                    ? 'Disable camera'
                    : 'Enable camera'
                }
                onClick$={toggleVideo}
              >
                {localVideoEnabled.value ? (
                  <LuCamera class="h-4 w-4" />
                ) : (
                  <LuCameraOff class="h-4 w-4" />
                )}
              </button>

              {/* Disconnect */}
              <button
                class="p-2.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
                title="Leave voice channel"
                onClick$={async () => { onToggleConnect(); }}
              >
                <LuPhoneOff class="h-5 w-5" />
              </button>

              {/* Screen share */}
              <button
                class={[
                  'p-2 rounded-full transition-colors cursor-pointer',
                  screenSharing.value
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    : 'text-muted hover:text-ink hover:bg-(--color-edge)',
                ].join(' ')}
                title={
                  screenSharing.value
                    ? 'Stop sharing'
                    : 'Share screen'
                }
                onClick$={toggleScreenShare}
              >
                {screenSharing.value ? (
                  <LuScreenShareOff class="h-4 w-4" />
                ) : (
                  <LuScreenShare class="h-4 w-4" />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    );
  },
);
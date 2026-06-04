# STOAT_LIVE.md — StoatChat Voice/Video Chat Implementation Guide

This document describes the architecture of the StoatChat voice and video server and provides a complete guide for clients and bots to join rooms, exchange media, handle real‑time events, and leave a call.

## 1. Server Architecture Overview

StoatChat’s voice/video system consists of the following components:

- **LiveKit SFU** – a Selective Forwarding Unit (SFU) that relays audio/video between participants. All media streams pass through LiveKit.
- **delta REST API** – authenticates users, checks permissions, and issues connection tokens for LiveKit.
- **bonfire WebSocket gateway** – pushes real‑time voice state events (join, leave, mute, etc.) to clients.
- **voice‑ingress daemon** – receives webhook events from LiveKit (participant_joined, participant_left, track_published, etc.) and translates them into internal state updates.
- **RabbitMQ** – message broker used to deliver voice events from voice‑ingress to bonfire.
- **Redis** – stores global voice state (which users are in which channels, their mute/deaf/video status).

### Flow Summary

1. Client makes an authenticated HTTP request to `delta` to join a voice channel.
2. `delta` verifies permissions and returns a LiveKit URL and a signed Join Token.
3. Client establishes a WebRTC connection with LiveKit using that token.
4. Media streams are sent directly to/from LiveKit, which forwards them to other participants.
5. LiveKit sends webhooks to `voice‑ingress` for state changes.
6. `voice‑ingress` updates Redis and publishes events via RabbitMQ to `bonfire`.
7. `bonfire` pushes JSON events over WebSocket to all relevant clients.

## 2. Authentication

All REST API calls require authentication. Use one of the following methods:

- **Bot token** – passed in the `Authorization` header as `Bot <token>`.
- **User session token** – obtained by logging in.

### Logging in as a user

    POST /0.8/auth/login
    Content-Type: application/json

    {
      "email": "user@example.com",
      "password": "yourpassword"
    }

A successful response contains a `session_token`. Include it in subsequent API requests as `Authorization: Bearer <session_token>`.

## 3. Joining a Voice Channel

To join a voice channel, the client (user or bot) must have the **Connect** permission.

### REST Call

    POST /0.8/channels/{channel_id}/join_call
    Authorization: Bearer <token>

### Successful Response

    {
      "url": "wss://livekit.your-instance.com",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }

The `url` is the WebSocket endpoint of the LiveKit server. The `token` is a JWT signed with the LiveKit API key and secret, granting access to a specific room (the channel).

### Connecting to LiveKit

Using the `livekit-client` SDK (JavaScript example):

    import { Room, ConnectOptions } from 'livekit-client';

    const room = new Room();
    await room.connect(url, token);
    console.log('Connected to LiveKit room:', room.name);

For bots, the `revoice.js` library abstracts this:

    const { Revoice } = require('revoice.js');
    const revoice = new Revoice('your-bot-token');
    const connection = await revoice.join(channelId);

The connection object emits events and provides controls for media.

## 4. Sending and Receiving Audio / Video

Once connected to LiveKit, the client can publish local tracks and subscribe to remote tracks.

### Publishing Local Media

- **Microphone**: request access to `userMedia` and publish an audio track.
- **Camera**: publish a video track.
- **Screen sharing**: publish a screen capture track.

Example using `livekit-client`:

    // Create local tracks
    const audioTrack = await createLocalAudioTrack();
    const videoTrack = await createLocalVideoTrack();

    // Publish them
    await room.localParticipant.publishTrack(audioTrack);
    await room.localParticipant.publishTrack(videoTrack);

StoatChat permissions apply: you need **Speak** to transmit audio, and **Video** to transmit video.

### Receiving Remote Media

Subscribe to the `trackSubscribed` event on the `Room` object:

    room.on('trackSubscribed', (track, publication, participant) => {
      if (track.kind === 'audio') {
        const audioElement = track.attach();
        document.body.appendChild(audioElement);
      } else if (track.kind === 'video') {
        const videoElement = track.attach();
        document.body.appendChild(videoElement);
      }
    });

Participants can also individually adjust volume or locally mute others, which is handled client‑side without server interaction.

## 5. Updating Voice State (Mute, Deafen, Video On/Off)

To change your own voice state, use the following REST endpoint:

    PATCH /0.8/channels/{channel_id}/members/@me/voice
    Content-Type: application/json

    {
      "mute": false,
      "deaf": false,
      "video": true
    }

All fields are optional. The server will apply the changes and broadcast a `VoiceStateUpdate` event to other clients via WebSocket.

- **mute** – server‑wide mute (cannot speak, only listen).
- **deaf** – server‑wide deafen (cannot hear others).
- **video** – turn camera (or screen share) on/off.

Moderators can also move users or force‑mute them, but those actions require additional permissions.

## 6. Handling Real‑Time Events via WebSocket

Connect to the **bonfire** WebSocket gateway to receive live voice events. The connection endpoint is the same as the main gateway (e.g., `wss://your-instance.com/ws`). After authentication, listen for the following events:

### VoiceChannelJoin

Sent when a user (including yourself) joins a voice channel.

    {
      "event": "VoiceChannelJoin",
      "data": {
        "channel_id": "vc_abc123",
        "state": {
          "user_id": "user_xyz",
          "mute": false,
          "deaf": false,
          "video": false,
          "self_mute": false,
          "self_deaf": false
        }
      }
    }

### VoiceChannelLeave

Sent when a user disconnects from a voice channel.

    {
      "event": "VoiceChannelLeave",
      "data": {
        "user_id": "user_xyz",
        "channel_id": "vc_abc123"
      }
    }

### VoiceChannelMove

Emitted when a user is moved by a moderator from one channel to another.

    {
      "event": "VoiceChannelMove",
      "data": {
        "user_id": "user_xyz",
        "from": "vc_abc123",
        "to": "vc_def456",
        "state": { ... }   // new voice state
      }
    }

### VoiceStateUpdate

Sent whenever a participant’s mute, deaf, or video status changes.

    {
      "event": "VoiceStateUpdate",
      "data": {
        "user_id": "user_xyz",
        "channel_id": "vc_abc123",
        "state": {
          "mute": true,
          "deaf": false,
          "video": false,
          "self_mute": false,
          "self_deaf": false
        }
      }
    }

All events contain the minimal information needed to keep the UI in sync.

## 7. Leaving a Voice Channel

There is no dedicated REST endpoint required to leave. Simply **disconnect** your LiveKit room:

    await room.disconnect();

When the LiveKit session ends, the LiveKit server fires a `participant_left` webhook. The `voice‑ingress` daemon processes it, removes the user from the Redis voice state, and publishes a `VoiceChannelLeave` event through RabbitMQ to `bonfire`. All other clients receive the `VoiceChannelLeave` event via WebSocket.

If you are using `revoice.js`, call:

    connection.disconnect();

## 8. Permissions and Limitations

- **Connect** – required to join any voice channel.
- **Speak** – required to publish an audio track. If you lack this permission, your microphone will not be transmitted even if the track is published (server‑side enforcement).
- **Video** – required to publish any video track (camera or screen share).
- **MoveMembers** – moderator permission to move users between channels.
- **Simultaneous connections** – a user can only be connected to one voice channel at a time.
- **AFK** – server owners can designate an AFK channel; idle users are automatically moved there.

## 9. Additional Considerations for Bots

The `revoice.js` library simplifies bot development:

    const revoice = new Revoice('bot-token');
    const conn = await revoice.join(channelId);

    conn.on('join', () => { /* bot is in the channel */ });
    conn.on('leave', () => { /* bot left */ });
    conn.on('stream', (stream) => { /* remote audio/video stream */ });

    // Play audio or intercept streams as needed.

Bots using `revoice.js` automatically handle the REST join, LiveKit connection, and event plumbing.

## 10. Group Chat Notifications

When a voice call starts in a group chat, a system message is automatically posted to the chat, including a “join” button. When the last participant leaves, a final message shows the total call duration. These messages are generated by the server and are not part of the voice WebSocket stream.
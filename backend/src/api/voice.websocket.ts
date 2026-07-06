import type http from 'http';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { voiceService } from '../services/voice.service.js';
import { claudeService } from '../services/claude.service.js';
import logger from '../utils/logger.js';

// ── Retell Custom LLM WebSocket — VA1 (non-streaming) ─────────────────────────
// Retell connects to wss://<host>/llm-websocket/{call_id} and expects our
// server to speak first (config + greeting), then exchange JSON events keyed
// by interaction_type. See Retell Custom LLM docs / official node demo.

interface ConnectionState {
  callId: string;
  branchId: string | null;
  latestResponseId: number;
  loggedCallDetailsShape: boolean;
  loggedTranscriptShape: boolean;
}

const URL_PATTERN = /^\/llm-websocket\/([^/]+)$/;

export function attachVoiceWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    const match = pathname.match(URL_PATTERN);
    if (!match) {
      socket.destroy();
      return;
    }

    const callId = match[1] as string;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, callId);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, callId: string) => {
    const state: ConnectionState = {
      callId,
      branchId: null,
      latestResponseId: 0,
      loggedCallDetailsShape: false,
      loggedTranscriptShape: false,
    };

    logger.info(`voice ws connected (call ${callId})`);

    // 1. Config event — must be sent before anything else.
    sendSafe(ws, { response_type: 'config', config: { auto_reconnect: true, call_details: true } });

    // 2. Greeting (begin-message, response_id 0).
    // TODO(VA2+): pull greeting text from the tenant's agent config once
    // branchId is resolved via call_details; VA1 uses a neutral default.
    sendSafe(ws, {
      response_type: 'response',
      response_id: 0,
      content: 'Thank you for calling. How can I help you today?',
      content_complete: true,
      end_call: false,
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch (err) {
        logger.error(`voice ws: malformed message (call ${callId}): ${(err as Error).message}`);
        return;
      }

      try {
        handleMessage(ws, state, msg);
      } catch (err) {
        logger.error(`voice ws: handler error (call ${callId}): ${(err as Error).message}`);
      }
    });

    ws.on('close', () => {
      logger.info(`voice ws closed (call ${callId})`);
    });

    ws.on('error', (err) => {
      logger.error(`voice ws error (call ${callId}): ${err.message}`);
    });
  });
}

function handleMessage(ws: WebSocket, state: ConnectionState, msg: Record<string, unknown>): void {
  const interactionType = msg['interaction_type'] as string | undefined;

  switch (interactionType) {
    case 'call_details': {
      const call = msg['call'] as Record<string, unknown> | undefined;
      if (!state.loggedCallDetailsShape) {
        logger.info('voice ws call_details shape', {
          callKeys: call ? Object.keys(call) : null,
        });
        state.loggedCallDetailsShape = true;
      }

      const agentId = call?.['agent_id'] as string | undefined;
      if (!agentId) {
        logger.warn(`voice ws: call_details missing agent_id (call ${state.callId})`);
        return;
      }

      voiceService.getByAgentId(agentId)
        .then(async (account) => {
          if (!account) {
            logger.warn(`voice ws: no voice account for agent_id ${agentId} (call ${state.callId})`);
            return;
          }
          const { branchId } = await voiceService.resolveAgentForAccount(account);
          state.branchId = branchId;
          logger.info(`voice ws: routed to branch ${branchId} (call ${state.callId})`);
        })
        .catch((err) => {
          logger.error(`voice ws: routing failed (call ${state.callId}): ${(err as Error).message}`);
        });
      return;
    }

    case 'ping_pong': {
      sendSafe(ws, { response_type: 'ping_pong', timestamp: msg['timestamp'] });
      return;
    }

    case 'update_only': {
      return;
    }

    case 'response_required':
    case 'reminder_required': {
      const responseId = Number(msg['response_id'] ?? 0);
      state.latestResponseId = responseId;

      const transcript = msg['transcript'] as Array<Record<string, unknown>> | undefined;
      if (!state.loggedTranscriptShape) {
        logger.info('voice ws transcript shape', {
          isArray: Array.isArray(transcript),
          sample: Array.isArray(transcript) ? transcript[transcript.length - 1] : null,
        });
        state.loggedTranscriptShape = true;
      }

      const lastUserUtterance = extractLastUserUtterance(transcript);

      if (interactionType === 'reminder_required' && !lastUserUtterance) {
        sendSafe(ws, {
          response_type: 'response',
          response_id: responseId,
          content: "Are you still there? I'm happy to help with anything about our projects.",
          content_complete: true,
          end_call: false,
        });
        return;
      }

      if (!state.branchId) {
        sendSafe(ws, {
          response_type: 'response',
          response_id: responseId,
          content: "I'm sorry, I'm having trouble connecting you right now — please try calling back in a few minutes.",
          content_complete: true,
          end_call: false,
        });
        return;
      }

      const t0 = Date.now();
      claudeService.chat({
        branchId: state.branchId,
        message: lastUserUtterance ?? '',
        sessionId: state.callId,
        channel: 'voice',
      })
        .then((result) => {
          logger.info(`voice ws chat latency: ${Date.now() - t0}ms (call ${state.callId})`);
          if (responseId !== state.latestResponseId) {
            logger.info(`voice ws: dropping stale response ${responseId} (latest ${state.latestResponseId})`);
            return;
          }
          sendSafe(ws, {
            response_type: 'response',
            response_id: responseId,
            content: result.reply,
            content_complete: true,
            end_call: false,
          });
        })
        .catch((err) => {
          logger.error(`voice ws chat failed (call ${state.callId}): ${(err as Error).message}`);
          if (responseId === state.latestResponseId) {
            sendSafe(ws, {
              response_type: 'response',
              response_id: responseId,
              content: "I'm having a little trouble right now — could you say that again?",
              content_complete: true,
              end_call: false,
            });
          }
        });
      return;
    }

    default:
      return;
  }
}

function extractLastUserUtterance(transcript: Array<Record<string, unknown>> | undefined): string | null {
  if (!Array.isArray(transcript)) return null;
  for (let i = transcript.length - 1; i >= 0; i--) {
    const item = transcript[i];
    if (item?.['role'] === 'user') {
      return (item['content'] as string | undefined) ?? null;
    }
  }
  return null;
}

function sendSafe(ws: WebSocket, payload: Record<string, unknown>): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  } catch (err) {
    logger.error(`voice ws: send failed: ${(err as Error).message}`);
  }
}

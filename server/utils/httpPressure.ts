import type { Server } from "node:http";

/** Aggregate counters only: no URLs, client addresses or credentials retained. */
export function createHttpPressureTracker() {
  const attached = new WeakSet<Server>();
  let inboundSockets = 0;
  let activeRequests = 0;
  let activeSportsStreams = 0;
  let peakRequests = 0;
  let peakSockets = 0;
  let completedRequests = 0;
  let abortedRequests = 0;

  return {
    attach(server: Server) {
      if (attached.has(server)) return;
      attached.add(server);
      server.on("connection", (socket) => {
        inboundSockets += 1;
        peakSockets = Math.max(peakSockets, inboundSockets);
        socket.once("close", () => { inboundSockets -= 1; });
      });
      // Observe even synchronous handlers (e.g. a cache hit or /health).
      server.prependListener("request", (req, res) => {
        const sportsStream = (req.url || "").split("?", 1)[0] === "/api/sports/live-stream";
        activeRequests += 1;
        if (sportsStream) activeSportsStreams += 1;
        peakRequests = Math.max(peakRequests, activeRequests);
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          activeRequests -= 1;
          if (sportsStream) activeSportsStreams -= 1;
          if (res.writableFinished) completedRequests += 1;
          else abortedRequests += 1;
          res.off("finish", release);
          res.off("close", release);
        };
        res.once("finish", release);
        res.once("close", release);
      });
    },
    snapshot() {
      return {
        inboundSockets, activeRequests, activeSportsStreams,
        peakRequests, peakSockets, completedRequests, abortedRequests,
      };
    },
  };
}

export const httpPressure = createHttpPressureTracker();

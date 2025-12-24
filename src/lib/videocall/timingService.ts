// Performance and Timing API Service
export class TimingService {
  /**
   * Measure execution time of an async function
   */
  static async measureAsync<T>(fn: () => Promise<T>, label?: string): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (label) {
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  }

  /**
   * Measure execution time of a sync function
   */
  static measure<T>(fn: () => T, label?: string): { result: T; duration: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    if (label) {
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  }

  /**
   * Mark a point in time and return a function to measure to that mark
   */
  static createMeasure(startLabel: string) {
    return (endLabel: string) => {
      performance.mark(endLabel);
      performance.measure(startLabel, startLabel, endLabel);
      const measure = performance.getEntriesByName(startLabel)[0] as PerformanceMeasure;
      console.log(`⏱️ ${startLabel} → ${endLabel}: ${measure.duration.toFixed(2)}ms`);
      performance.clearMarks(startLabel);
      performance.clearMarks(endLabel);
      performance.clearMeasures(startLabel);
      return measure.duration;
    };
  }

  /**
   * Get page load metrics
   */
  static getPageMetrics(): {
    dns: number;
    tcp: number;
    ttfb: number;
    domContentLoaded: number;
    pageLoad: number;
  } | null {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (!nav) return null;

    return {
      dns: nav.domainLookupEnd - nav.domainLookupStart,
      tcp: nav.connectEnd - nav.connectStart,
      ttfb: nav.responseStart - nav.requestStart,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
      pageLoad: nav.loadEventEnd - nav.loadEventStart,
    };
  }

  /**
   * Get WebRTC connection metrics
   */
  static async getRTCMetrics(
    peerConnection: RTCPeerConnection
  ): Promise<{
    bytesReceived: number;
    bytesSent: number;
    framesDecoded: number;
    framesEncoded: number;
    packetsLost: number;
    jitter: number;
  } | null> {
    try {
      const stats = await peerConnection.getStats();
      let inboundRtp: any = null;
      let outboundRtp: any = null;

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          inboundRtp = report;
        }
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          outboundRtp = report;
        }
      });

      return {
        bytesReceived: inboundRtp?.bytesReceived || 0,
        bytesSent: outboundRtp?.bytesSent || 0,
        framesDecoded: inboundRtp?.framesDecoded || 0,
        framesEncoded: outboundRtp?.framesEncoded || 0,
        packetsLost: inboundRtp?.packetsLost || 0,
        jitter: inboundRtp?.jitter || 0,
      };
    } catch (error) {
      console.error('Failed to get RTC metrics:', error);
      return null;
    }
  }

  /**
   * Debounce function with timing
   */
  static debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Throttle function with timing
   */
  static throttle<T extends (...args: any[]) => any>(fn: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
}

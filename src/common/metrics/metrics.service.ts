import { Injectable } from '@nestjs/common';

/** 轻量 Prometheus 文本指标（无需 prom-client） */
@Injectable()
export class MetricsService {
  private counters = new Map<string, number>();
  private histograms = new Map<string, { sum: number; count: number }>();

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  observe(name: string, value: number): void {
    const current = this.histograms.get(name) ?? { sum: 0, count: 0 };
    current.sum += value;
    current.count += 1;
    this.histograms.set(name, current);
  }

  toPrometheusText(): string {
    const lines: string[] = [];

    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, stats] of this.histograms) {
      lines.push(`# TYPE ${name} summary`);
      lines.push(`${name}_sum ${stats.sum}`);
      lines.push(`${name}_count ${stats.count}`);
      if (stats.count > 0) {
        lines.push(`${name}_avg ${stats.sum / stats.count}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}

process.env.HEALTH_MONITOR_DB = ':memory:';

import { evaluateAlertState, getAlertConfig, setAlertConfig } from '../../src/alerts.js';
import { resetDbForTests } from '../../src/db.js';
import { recordHealthCheck, registerServer } from '../../src/registry.js';

describe('alerts', () => {
  beforeEach(() => {
    resetDbForTests();
    registerServer({
      name: 'alerted-server',
      type: 'http',
      url: 'https://alerted.example/mcp',
      tags: [],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });
  });

  it('persists alert configuration', () => {
    setAlertConfig({
      name: 'alerted-server',
      max_response_time_ms: 250,
      min_uptime_percent: 99,
      consecutive_failures_before_alert: 2
    });

    expect(getAlertConfig('alerted-server')).toEqual(
      expect.objectContaining({
        server_name: 'alerted-server',
        max_response_time_ms: 250,
        min_uptime_percent: 99,
        consecutive_failures_before_alert: 2
      })
    );
  });

  it('returns no alerts when thresholds are not breached', () => {
    setAlertConfig({
      name: 'alerted-server',
      max_response_time_ms: 250,
      min_uptime_percent: 80,
      consecutive_failures_before_alert: 3
    });
    recordHealthCheck('alerted-server', {
      status: 'up',
      response_time_ms: 200,
      tool_count: 3,
      error_message: null,
      tools: ['a', 'b', 'c']
    });

    const evaluation = evaluateAlertState('alerted-server', {
      status: 'up',
      response_time_ms: 200,
      tool_count: 3,
      error_message: null,
      tools: ['a', 'b', 'c']
    });

    expect(evaluation.has_alerts).toBe(false);
    expect(evaluation.findings).toEqual([]);
  });

  it('alerts on response time breach', () => {
    setAlertConfig({
      name: 'alerted-server',
      max_response_time_ms: 120,
      consecutive_failures_before_alert: 3
    });
    recordHealthCheck('alerted-server', {
      status: 'up',
      response_time_ms: 150,
      tool_count: 1,
      error_message: null,
      tools: ['tool-a']
    });

    const evaluation = evaluateAlertState('alerted-server', {
      status: 'up',
      response_time_ms: 150,
      tool_count: 1,
      error_message: null,
      tools: ['tool-a']
    });

    expect(evaluation.findings).toEqual([
      expect.objectContaining({
        type: 'response_time',
        actual: 150,
        threshold: 120
      })
    ]);
  });

  it('alerts on uptime breach', () => {
    setAlertConfig({
      name: 'alerted-server',
      min_uptime_percent: 80,
      consecutive_failures_before_alert: 3
    });
    recordHealthCheck('alerted-server', {
      status: 'down',
      response_time_ms: null,
      tool_count: null,
      error_message: 'boom',
      tools: null
    });
    recordHealthCheck('alerted-server', {
      status: 'up',
      response_time_ms: 100,
      tool_count: 2,
      error_message: null,
      tools: ['a', 'b']
    });

    const evaluation = evaluateAlertState('alerted-server', {
      status: 'up',
      response_time_ms: 100,
      tool_count: 2,
      error_message: null,
      tools: ['a', 'b']
    });

    expect(evaluation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'uptime',
          actual: 50,
          threshold: 80
        })
      ])
    );
  });

  it('alerts on consecutive failures and down status', () => {
    setAlertConfig({
      name: 'alerted-server',
      consecutive_failures_before_alert: 2
    });
    recordHealthCheck('alerted-server', {
      status: 'down',
      response_time_ms: null,
      tool_count: null,
      error_message: 'timeout',
      tools: null
    });
    recordHealthCheck('alerted-server', {
      status: 'timeout',
      response_time_ms: 5000,
      tool_count: null,
      error_message: 'timeout',
      tools: null
    });

    const evaluation = evaluateAlertState('alerted-server', {
      status: 'timeout',
      response_time_ms: 5000,
      tool_count: null,
      error_message: 'timeout',
      tools: null
    });

    expect(evaluation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'down' }),
        expect.objectContaining({
          type: 'consecutive_failures',
          actual: 2,
          threshold: 2
        })
      ])
    );
  });
});

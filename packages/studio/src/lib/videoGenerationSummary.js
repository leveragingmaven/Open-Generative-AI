/**
 * Compact pre-generation summary for Video Studio.
 *
 * The model chooser already shows the provider and model, but the generation is
 * priced by the settings that travel with it (duration, resolution, audio), and
 * those were only discoverable by opening three separate dropdowns. This renders
 * one honest line - provider, model, aspect ratio, duration, resolution, audio -
 * using only what the catalog declares and what the studio will actually send.
 * Fields the studio does not send are reported as the provider's default rather
 * than guessed.
 */
export function videoGenerationSummary({ model, inputs = {}, audio } = {}) {
  const duration = Number(inputs.duration);
  return [
    model?.provider_name || model?.provider || 'Provider unknown',
    model?.name || model?.id || 'Model unknown',
    inputs.aspect_ratio ? String(inputs.aspect_ratio) : null,
    Number.isFinite(duration) ? `${duration}s` : 'duration: provider default',
    inputs.resolution ? String(inputs.resolution) : 'resolution: provider default',
    `audio: ${audio === true ? 'on' : audio === false ? 'off' : 'provider default'}`,
  ].filter(Boolean).join(' · ');
}

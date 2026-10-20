function categorizedTreatments(recommendations, category) {
  const labels = category === 'organic'
    ? /^(?:organic solution|organic):\s*/i
    : /^(?:inorganic solution|chemical treatment|chemical):\s*/i;
  return recommendations.flatMap((item) => {
    if (typeof item !== 'string' || !labels.test(item)) return [];
    return [item.replace(labels, '').trim()];
  });
}

export function getDiagnosticOutput(scan) {
  const details = scan.diagnostic || scan;
  const prediction = typeof scan.prediction === 'string'
    ? scan.prediction
    : scan.prediction?.label || scan.prediction?.class;
  const isHealthy = typeof prediction === 'string' && prediction.toLowerCase() === 'healthy';
  const rawConfidence = Number(details.confidence ?? scan.confidence ?? scan.prediction?.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence
    : null;
  const confidenceLevel = confidence === null ? 'unavailable' : confidence < 60 ? 'uncertain' : confidence < 80 ? 'moderate' : 'high';
  const recommendations = Array.isArray(scan.recommendations) ? scan.recommendations : [];
  const organicSolutions = Array.isArray(details.organicSolutions)
    ? details.organicSolutions
    : categorizedTreatments(recommendations, 'organic');
  const chemicalTreatments = Array.isArray(details.chemicalTreatments)
    ? details.chemicalTreatments
    : categorizedTreatments(recommendations, 'chemical');
  const referenceNumber = String(scan.id || '').match(/\d+$/)?.[0];

  return {
    reference: details.reference || (referenceNumber ? `AD-${referenceNumber}` : 'LIVE'),
    confidenceLevel,
    confidenceLabel: confidenceLevel === 'unavailable' ? 'NO CONFIDENCE' : confidenceLevel.toUpperCase(),
    confidenceText: confidence === null ? 'CERTAINTY NOT PROVIDED' : `${confidence.toFixed(1)}% CERTAINTY`,
    specimen: details.specimen || scan.specimen || `${scan.crop || 'Crop'} sample`,
    fieldZone: details.fieldZone || details.field_zone || scan.fieldZone || scan.field_zone || 'Not provided',
    location: details.location || scan.location || 'Not provided',
    isHealthy,
    disease: details.disease || (isHealthy ? 'No disease detected' : prediction) || 'No prediction returned',
    pestVector: details.pestVector || details.pest || 'Not assessed',
    nutritionalStatus: details.nutritionalStatus || details.nutrition || 'Not assessed',
    fruitQuality: details.fruitQuality || 'Not assessed',
    organicSolutions: organicSolutions.length ? organicSolutions : ['No organic recommendation returned.'],
    chemicalTreatments: chemicalTreatments.length ? chemicalTreatments : ['No chemical recommendation returned.'],
    warning: details.warning || details.confidenceMessage || (scan.isDemo
      ? 'Sample output only. This demo does not analyze the uploaded image or provide a diagnosis.'
      : confidenceLevel === 'uncertain'
        ? 'Low-confidence result. Confirm the finding with a qualified specialist before taking action.'
        : scan.analysis || 'Review the prediction with a qualified specialist before taking action.'),
  };
}

export function buildReportText(scan) {
  return [
    'AGRODOC · TOMATO CROP HEALTH REPORT',
    `Scan date: ${new Date(scan.createdAt).toLocaleString()}`,
    `Location: ${scan.location}`,
    'Crop: Tomato',
    `Result: ${scan.prediction}`,
    `Health status: ${scan.health}`,
    `Confidence: ${Number(scan.confidence).toFixed(1)}%`,
    '',
    'AI analysis',
    scan.analysis,
    '',
    'Recommendations',
    ...scan.recommendations.map((item) => `- ${item}`),
    '',
    'Demo workspace: sample scan data is illustrative and is not agronomic advice.',
  ].join('\n');
}

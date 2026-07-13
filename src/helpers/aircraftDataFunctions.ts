const altitudeStateLimit = 1000;

export const getFormattedValue = (rawValue: number, maxFractionDigits: number) => {

  const NumberFormatter = new Intl.NumberFormat(undefined, { style: 'decimal', useGrouping: false, maximumFractionDigits: maxFractionDigits });
  return NumberFormatter.format(rawValue);
};

export const getRotation = (trueTrack: number, verticalRate: number, altitude: number) => {

  if (verticalRate > 0 && altitude < altitudeStateLimit)
    return 0.0;

  if (verticalRate < 0 && altitude < altitudeStateLimit)
    return 0.0;

  return trueTrack;
};

export const getColor = (altitude: number) => {

  let percent = altitude / 13000 * 100;
  if (percent > 100)
    percent = 100;
  if (percent < 0)
    percent = 0;

  let r, g;
  const b = 0;
  if (percent < 50) {
    r = 255;
    g = Math.round(5.1 * percent);
  }
  else {
    g = 255;
    r = Math.round(510 - 5.10 * percent);
  }

  const h = r * 0x10000 + g * 0x100 + b * 0x1;

  return '#' + ('000000' + h.toString(16)).slice(-6);
};

export const getIconName = (isOnGround: boolean, verticalRate: number, altitude: number, trueTrack: number): string => {
  if (isOnGround) return 'flight-icon';

  const isFlipped = trueTrack > 90 && trueTrack < 270;

  if (verticalRate > 0 && altitude < altitudeStateLimit)
    return isFlipped ? 'flight-takeoff-flipped-icon' : 'flight-takeoff-icon';

  if (verticalRate < 0 && altitude < altitudeStateLimit)
    return isFlipped ? 'flight-land-flipped-icon' : 'flight-land-icon';

  return 'flight-icon';
};

export const getStatusText = (isOnGround: boolean, verticalRate: number, altitude: number): string => {

  if (isOnGround)
    return 'On Ground';

  if (altitude <= 0)
    return 'On Ground';

  if (verticalRate > 0 && altitude < altitudeStateLimit)
    return 'Taking off';

  if (verticalRate < 0 && altitude < altitudeStateLimit)
    return 'Landing';

  return 'On Track';
};

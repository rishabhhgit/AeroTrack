export const svgToImageAsync = (svgPath: string, width: number, height: number) => {

  return new Promise<HTMLImageElement>((resolve, reject) => {

    const image = new Image(width, height);
    const onLoad = () => { cleanup(); resolve(image); };
    const onError = () => { cleanup(); reject(new Error(`Failed to load SVG: ${svgPath}`)); };
    const cleanup = () => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    image.addEventListener('load', onLoad);
    image.addEventListener('error', onError);
    image.src = svgPath;
  });
}

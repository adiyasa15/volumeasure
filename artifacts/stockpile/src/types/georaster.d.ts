declare module "georaster" {
  export interface Georaster {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    width: number;
    height: number;
    noDataValue: number | null;
    numberOfRasters: number;
    values: number[][][];
    pixelWidth: number;
    pixelHeight: number;
    projection: number;
  }

  function parseGeoraster(
    input: ArrayBuffer | string | ArrayBuffer[],
  ): Promise<Georaster>;

  export default parseGeoraster;
}

declare module "georaster-layer-for-leaflet" {
  import L from "leaflet";

  interface GeoRasterLayerOptions extends L.GridLayerOptions {
    georaster: import("georaster").Georaster;
    opacity?: number;
    resolution?: number;
    pixelValuesToColorFn?: (values: number[]) => string | null;
    debugLevel?: number;
  }

  class GeoRasterLayer extends L.GridLayer {
    constructor(options: GeoRasterLayerOptions);
  }

  export default GeoRasterLayer;
}

import exifr from 'exifr';

export interface ImageProcessResult {
  file: File;
  accepted: boolean;
  rejectionReason?: string;
  latitude?: number;
  longitude?: number;
  sharpnessScore?: number;
}

export async function processImageFile(file: File, extractGps: boolean): Promise<ImageProcessResult> {
  const result: ImageProcessResult = {
    file,
    accepted: true,
  };

  try {
    // Basic file type check
    if (!['image/jpeg', 'image/png', 'image/tiff'].includes(file.type)) {
      return { ...result, accepted: false, rejectionReason: 'Unsupported format' };
    }

    // Extract GPS if requested and possible
    if (extractGps && (file.type === 'image/jpeg' || file.type === 'image/tiff')) {
      try {
        const exifData = await exifr.gps(file);
        if (exifData) {
          result.latitude = exifData.latitude;
          result.longitude = exifData.longitude;
        }
      } catch (e) {
        console.warn('Failed to extract GPS from', file.name, e);
      }
    }

    // Sharpness check using canvas
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Scale down for faster processing
        const MAX_DIM = 800;
        let w = bitmap.width;
        let h = bitmap.height;
        
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(bitmap, 0, 0, w, h);
        
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        
        // Convert to grayscale
        const gray = new Float32Array(w * h);
        for (let i = 0; i < data.length; i += 4) {
          gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        
        // Compute variance of Laplacian
        let sumLaplacian = 0;
        const laplacians = new Float32Array((w - 2) * (h - 2));
        let idx = 0;
        
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const p = y * w + x;
            const laplacian = 
              gray[p - w] + 
              gray[p - 1] + 
              -4 * gray[p] + 
              gray[p + 1] + 
              gray[p + w];
            
            laplacians[idx++] = laplacian;
            sumLaplacian += laplacian;
          }
        }
        
        const meanLaplacian = sumLaplacian / laplacians.length;
        let variance = 0;
        
        for (let i = 0; i < laplacians.length; i++) {
          const diff = laplacians[i] - meanLaplacian;
          variance += diff * diff;
        }
        
        variance /= laplacians.length;
        result.sharpnessScore = variance;
        
        // Threshold for blurriness
        if (variance < 50) {
          return { ...result, accepted: false, rejectionReason: 'Image is too blurry', sharpnessScore: variance };
        }
      }
    } catch (e) {
      console.warn('Failed to calculate sharpness for', file.name, e);
    }
    
  } catch (error) {
    return { ...result, accepted: false, rejectionReason: 'Processing error' };
  }

  return result;
}

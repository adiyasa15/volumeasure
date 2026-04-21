import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateJob } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, X, Image as ImageIcon, MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { processImageFile, ImageProcessResult } from "@/lib/image-processing";
import { Progress } from "@/components/ui/progress";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  materialType: z.enum(["sand", "soil", "coal"]),
  sourceType: z.enum(["drone", "smartphone", "dslr"]),
  precisionLevel: z.enum(["low", "medium", "high"]),
  notes: z.string().optional(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewJob() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [images, setImages] = useState<ImageProcessResult[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const createJob = useCreateJob();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: `Measurement ${new Date().toISOString().split('T')[0]}`,
      materialType: "sand",
      sourceType: "drone",
      precisionLevel: "medium",
      notes: "",
      latitude: null,
      longitude: null,
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    
    setIsProcessingFiles(true);
    setProcessingProgress(0);
    
    const processedImages: ImageProcessResult[] = [];
    const source = form.getValues("sourceType");
    
    // Process files sequentially to not block the main thread too much
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await processImageFile(file, source === 'drone');
      processedImages.push(result);
      setProcessingProgress(((i + 1) / files.length) * 100);
      
      // If we found GPS coordinates and form doesn't have them yet, auto-fill
      if (result.latitude && result.longitude && !form.getValues("latitude")) {
        form.setValue("latitude", result.latitude);
        form.setValue("longitude", result.longitude);
      }
    }
    
    setImages((prev) => [...prev, ...processedImages]);
    setIsProcessingFiles(false);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    if (images.length === 0) {
      toast({
        title: "Missing images",
        description: "Please upload at least one image for measurement.",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload = {
        ...values,
        latitude: values.latitude || undefined,
        longitude: values.longitude || undefined,
        images: images.map(img => ({
          name: img.file.name,
          sizeBytes: img.file.size,
          accepted: img.accepted,
          rejectionReason: img.rejectionReason,
          latitude: img.latitude,
          longitude: img.longitude,
          sharpnessScore: img.sharpnessScore
        }))
      };

      const job = await createJob.mutateAsync({ data: payload });
      
      toast({
        title: "Job Created",
        description: "Your measurement job has been queued for processing.",
      });
      
      setLocation(`/jobs/${job.id}`);
    } catch (error) {
      toast({
        title: "Failed to create job",
        description: "An error occurred while creating the measurement job.",
        variant: "destructive",
      });
    }
  };

  const acceptedCount = images.filter(img => img.accepted).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">New Measurement</h1>
        <p className="text-muted-foreground">Upload imagery and configure a new volumetric calculation job.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="font-mono uppercase text-sm">Job Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Identifier</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. North Pit Sand Q3" className="font-mono bg-background/50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="materialType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Material</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="font-mono uppercase text-sm bg-background/50">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="sand">Sand</SelectItem>
                              <SelectItem value="soil">Soil</SelectItem>
                              <SelectItem value="coal">Coal</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="sourceType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Camera Source</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="font-mono uppercase text-sm bg-background/50">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="drone">Drone (GPS)</SelectItem>
                              <SelectItem value="dslr">DSLR</SelectItem>
                              <SelectItem value="smartphone">Smartphone</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="precisionLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Processing Precision</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="font-mono uppercase text-sm bg-background/50">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Fast (Preview)</SelectItem>
                            <SelectItem value="medium">Standard</SelectItem>
                            <SelectItem value="high">High Accuracy</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Higher precision takes longer but provides more accurate volumetric models.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Latitude</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="any" 
                              placeholder="Auto-filled from EXIF" 
                              className="font-mono bg-background/50" 
                              value={field.value ?? ""}
                              onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Longitude</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="any" 
                              placeholder="Auto-filled from EXIF" 
                              className="font-mono bg-background/50" 
                              value={field.value ?? ""}
                              onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono uppercase text-xs text-muted-foreground">Operator Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Weather conditions, pile adjustments..." className="resize-none h-20 bg-background/50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-card/50 border-border/50 flex flex-col h-full">
                <CardHeader>
                  <CardTitle className="font-mono uppercase text-sm">Imagery Upload</CardTitle>
                  <CardDescription>
                    Requires at least 10 images with good overlap.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                  <div 
                    className="border-2 border-dashed border-border/50 rounded-lg bg-background/30 p-8 flex flex-col items-center justify-center text-center hover:bg-secondary/20 transition-colors cursor-pointer relative"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple
                      accept="image/jpeg,image/png,image/tiff"
                      onChange={handleFileSelect}
                      disabled={isProcessingFiles}
                    />
                    
                    {isProcessingFiles ? (
                      <div className="flex flex-col items-center space-y-4 w-full max-w-[200px]">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <div className="w-full space-y-1">
                          <div className="flex justify-between text-xs font-mono text-muted-foreground">
                            <span>Analyzing</span>
                            <span>{Math.round(processingProgress)}%</span>
                          </div>
                          <Progress value={processingProgress} className="h-1" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
                        <p className="text-sm font-medium font-mono uppercase mb-1">Click or drag images</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG, or TIFF</p>
                      </>
                    )}
                  </div>

                  {images.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono uppercase text-muted-foreground">
                        <span>{images.length} Files Total</span>
                        <span className={acceptedCount < 10 ? "text-destructive" : "text-primary"}>
                          {acceptedCount} Accepted (Min 10)
                        </span>
                      </div>
                      
                      <div className="h-[250px] overflow-y-auto pr-2 space-y-2">
                        {images.map((img, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded bg-background/50 border border-border/50 text-sm">
                            <div className="flex-shrink-0">
                              {img.accepted ? (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
                            <div className="flex-1 truncate">
                              <p className="truncate font-mono text-xs">{img.file.name}</p>
                              {!img.accepted && (
                                <p className="text-[10px] text-destructive truncate">{img.rejectionReason}</p>
                              )}
                            </div>
                            {img.sharpnessScore && (
                              <div className="text-[10px] font-mono text-muted-foreground hidden sm:block">
                                S:{Math.round(img.sharpnessScore)}
                              </div>
                            )}
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 rounded-full hover:bg-destructive/20 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(idx);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-4 border-t border-border/50">
                  <Button 
                    type="submit" 
                    className="w-full font-mono uppercase" 
                    disabled={isProcessingFiles || images.length === 0 || createJob.isPending}
                  >
                    {createJob.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Queuing Job...</>
                    ) : (
                      "Start Processing"
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
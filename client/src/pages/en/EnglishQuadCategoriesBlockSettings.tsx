import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { EnglishDashboardLayout } from "@/components/en/EnglishDashboardLayout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { enCategories } from "@shared/schema";

// Form Schema
const formSchema = z.object({
  config: z.object({
    sections: z.array(z.object({
      categorySlug: z.string().min(1, "Category is required"),
      headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
      statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
      teaser: z.string().optional(),
      listSize: z.number().min(3, "Minimum 3").max(8, "Maximum 8"),
    })).length(4, "Must select exactly 4 categories"),
    mobileCarousel: z.boolean(),
    freshHours: z.number().min(1).max(72),
    badges: z.object({
      exclusive: z.boolean(),
      breaking: z.boolean(),
      analysis: z.boolean(),
    }),
    backgroundColor: z.string().optional(),
  }),
});

type FormData = z.infer<typeof formSchema>;

export default function EnglishQuadCategoriesBlockSettings() {
  const { toast } = useToast();

  // Fetch English categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<Array<typeof enCategories.$inferSelect>>({
    queryKey: ["/api/en/categories"],
  });

  // Fetch current English settings
  const { data: settings, isLoading: settingsLoading } = useQuery<{ config: FormData["config"]; isActive: boolean }>({
    queryKey: ["/api/en/admin/blocks/quad-categories/settings"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      config: {
        sections: [
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
        ],
        mobileCarousel: true,
        freshHours: 12,
        badges: {
          exclusive: true,
          breaking: true,
          analysis: true,
        },
        backgroundColor: undefined,
      },
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings && !form.formState.isDirty) {
      form.reset(settings);
    }
  }, [settings]);

  // Save mutation for English settings
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return await apiRequest("/api/en/admin/blocks/quad-categories/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/en/blocks/quad-categories"] });
      queryClient.refetchQueries({ queryKey: ["/api/en/blocks/quad-categories"] });
      queryClient.removeQueries({ queryKey: ["/api/en/admin/blocks/quad-categories/settings"] });
      queryClient.refetchQueries({ queryKey: ["/api/en/admin/blocks/quad-categories/settings"] });
      toast({
        title: "Saved successfully",
        description: "English quad categories block settings saved",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "An error occurred while saving",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  if (settingsLoading || categoriesLoading) {
    return (
      <EnglishDashboardLayout>
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        </div>
      </EnglishDashboardLayout>
    );
  }

  const activeCategories = categoriesData?.filter((c) => c.status === "active") || [];

  return (
    <EnglishDashboardLayout>
      <div className="container mx-auto p-6 max-w-6xl" data-testid="quad-categories-settings-page">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold" data-testid="page-title">
              Quad Categories Block
            </h1>
            <p className="text-muted-foreground mt-2" data-testid="page-description">
              Settings for displaying 4 categories in one block on the homepage
            </p>
          </div>

        <Separator />

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Sections Configuration */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">The Four Categories</h2>
              <div className="grid gap-6">
                {[0, 1, 2, 3].map((index) => (
                  <Card key={index} data-testid={`section-card-${index}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">Column {index + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Category Selection */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.categorySlug`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`category-select-${index}`}>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {activeCategories.map((cat) => (
                                  <SelectItem key={cat.slug} value={cat.slug}>
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Headline Mode */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.headlineMode`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>News Source</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`headline-mode-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="latest">Latest</SelectItem>
                                <SelectItem value="mostViewed">Most Viewed</SelectItem>
                                <SelectItem value="editorsPick">Editors' Pick</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Stat Type */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.statType`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Statistics Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`stat-type-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="dailyCount">Today's Articles Count</SelectItem>
                                <SelectItem value="weeklyCount">Weekly Articles Count</SelectItem>
                                <SelectItem value="totalViews">Total Views</SelectItem>
                                <SelectItem value="engagementRate">Engagement Rate</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Teaser */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.teaser`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Short Description (optional)</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="e.g., Today's top regional coverage"
                                data-testid={`teaser-${index}`}
                              />
                            </FormControl>
                            <FormDescription>
                              Descriptive text displayed below category name
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* List Size */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.listSize`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of Articles (after main article)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min={3} 
                                max={8}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                data-testid={`list-size-${index}`}
                              />
                            </FormControl>
                            <FormDescription>
                              From 3 to 8 articles
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Global Settings */}
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Mobile Carousel */}
                <FormField
                  control={form.control}
                  name="config.mobileCarousel"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable Mobile Swipe</FormLabel>
                        <FormDescription>
                          Display categories in a swipeable carousel on mobile devices
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="mobile-carousel-switch"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Fresh Hours */}
                <FormField
                  control={form.control}
                  name="config.freshHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Age for "New" Article (hours)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1} 
                          max={72}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="fresh-hours-input"
                        />
                      </FormControl>
                      <FormDescription>
                        Articles newer than this number of hours will get a "New" badge
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Badges */}
                <div className="space-y-4">
                  <FormLabel className="text-base">Enabled Badges</FormLabel>
                  
                  <FormField
                    control={form.control}
                    name="config.badges.breaking"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-sm font-normal">"Breaking" Badge</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="badge-breaking-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.badges.exclusive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-sm font-normal">"Exclusive" Badge</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="badge-exclusive-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.badges.analysis"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-sm font-normal">"Analysis" Badge</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="badge-analysis-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Background Color */}
                <FormField
                  control={form.control}
                  name="config.backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Block Background Color (optional)</FormLabel>
                      <div className="flex gap-3 items-center">
                        <FormControl>
                          <Input 
                            type="color"
                            {...field}
                            value={field.value || "#ffffff"}
                            className="w-20 h-10 cursor-pointer"
                            data-testid="background-color-picker"
                          />
                        </FormControl>
                        <Input 
                          type="text"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                          data-testid="background-color-input"
                        />
                        {field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => field.onChange(undefined)}
                            data-testid="clear-background-color"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormDescription>
                        Choose a background color for the block. The background will span the full width of the page. Leave empty to use the default background.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !form.formState.isDirty}
                data-testid="save-button"
              >
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </Button>
            </div>
          </form>
        </Form>
      </div>
      </div>
    </EnglishDashboardLayout>
  );
}

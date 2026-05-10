import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EnglishDashboardLayout } from "@/components/en/EnglishDashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Blocks, Plus, Edit, Trash2 } from "lucide-react";
import type { EnSmartBlock, InsertEnSmartBlock } from "@shared/schema";
import { insertEnSmartBlockSchema } from "@shared/schema";

const placementOptions = [
  { value: 'below_featured', label: 'Below Main Banner' },
  { value: 'above_all_news', label: 'Above All News' },
  { value: 'between_all_and_murqap', label: 'Between News & Mirqab' },
  { value: 'above_footer', label: 'Above Footer' },
] as const;

const layoutStyleOptions = [
  { value: 'grid', label: 'Grid - 4 Columns' },
  { value: 'list', label: 'List - Large Side Images' },
  { value: 'featured', label: 'Featured - Large + Small Articles' },
] as const;

export default function EnglishSmartBlocksPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<EnSmartBlock | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const form = useForm<InsertEnSmartBlock>({
    resolver: zodResolver(insertEnSmartBlockSchema),
    defaultValues: {
      title: '',
      keyword: '',
      color: '#3B82F6',
      placement: 'below_featured',
      layoutStyle: 'grid',
      limitCount: 6,
      isActive: true,
    },
  });

  const { data: blocksRaw, isLoading } = useQuery<EnSmartBlock[]>({
    queryKey: ['/api/en/smart-blocks'],
  });
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];

  const createMutation = useMutation({
    mutationFn: async (data: InsertEnSmartBlock) => {
      return await apiRequest('/api/en/smart-blocks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/en/smart-blocks'] });
      toast({
        title: "Created",
        description: "Smart block created successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create smart block",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertEnSmartBlock }) => {
      return await apiRequest(`/api/en/smart-blocks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/en/smart-blocks'] });
      toast({
        title: "Updated",
        description: "Smart block updated successfully",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update smart block",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/en/smart-blocks/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/en/smart-blocks'] });
      toast({
        title: "Deleted",
        description: "Smart block deleted successfully",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete smart block",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: InsertEnSmartBlock) => {
    if (editingBlock) {
      updateMutation.mutate({ id: editingBlock.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (block: EnSmartBlock) => {
    setEditingBlock(block);
    form.reset({
      title: block.title,
      keyword: block.keyword,
      color: block.color,
      placement: block.placement as any,
      layoutStyle: block.layoutStyle as any,
      limitCount: block.limitCount,
      isActive: block.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBlock(null);
    form.reset({
      title: '',
      keyword: '',
      color: '#3B82F6',
      placement: 'below_featured',
      layoutStyle: 'grid',
      limitCount: 6,
      isActive: true,
    });
  };

  const getPlacementLabel = (placement: string) => {
    return placementOptions.find(opt => opt.value === placement)?.label || placement;
  };

  const getLayoutStyleLabel = (layoutStyle: string) => {
    return layoutStyleOptions.find(opt => opt.value === layoutStyle)?.label || layoutStyle;
  };

  const formValues = form.watch();

  return (
    <EnglishDashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Blocks className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-testid="heading-smart-blocks">
                Smart Blocks
              </h1>
            </div>
            <p className="text-muted-foreground mt-2">
              Manage smart blocks to display custom content on the homepage
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingBlock(null);
              form.reset({
                title: '',
                keyword: '',
                color: '#3B82F6',
                placement: 'below_featured',
                layoutStyle: 'grid',
                limitCount: 6,
                isActive: true,
              });
              setIsDialogOpen(true);
            }}
            data-testid="button-create-smart-block"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Block
          </Button>
        </div>

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Blocks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">{blocks.length}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Blocks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-stat-active">
                {blocks.filter(b => b.isActive).length}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-inactive">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inactive Blocks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground" data-testid="text-stat-inactive">
                {blocks.filter(b => !b.isActive).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Blocks Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Blocks</CardTitle>
            <CardDescription>
              View and manage all smart blocks in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading...
              </div>
            ) : blocks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Blocks className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No smart blocks yet</p>
                <p className="text-sm">Click "Create New Block" to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Color</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead>Placement</TableHead>
                      <TableHead>Layout</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocks.map((block) => (
                      <TableRow key={block.id} data-testid={`row-block-${block.id}`}>
                        <TableCell>
                          <div
                            className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                            style={{ backgroundColor: block.color }}
                            data-testid={`color-preview-${block.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-title-${block.id}`}>
                          {block.title}
                        </TableCell>
                        <TableCell data-testid={`text-keyword-${block.id}`}>
                          <Badge variant="outline">{block.keyword}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-placement-${block.id}`}>
                          {getPlacementLabel(block.placement)}
                        </TableCell>
                        <TableCell data-testid={`text-layout-${block.id}`}>
                          <Badge variant="secondary">{getLayoutStyleLabel(block.layoutStyle || 'grid')}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-limit-${block.id}`}>
                          {block.limitCount}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={block.isActive ? "default" : "secondary"}
                            data-testid={`badge-status-${block.id}`}
                          >
                            {block.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEdit(block)}
                              data-testid={`button-edit-block-${block.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(block.id)}
                              data-testid={`button-delete-block-${block.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">
                {editingBlock ? 'Edit Smart Block' : 'Create New Smart Block'}
              </DialogTitle>
              <DialogDescription>
                {editingBlock 
                  ? 'Update the smart block information'
                  : 'Create a new smart block to display custom content'}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title (60 characters max)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g., Tech News"
                          maxLength={60}
                          data-testid="input-block-title"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {field.value?.length || 0} / 60
                      </p>
                    </FormItem>
                  )}
                />

                {/* Keyword */}
                <FormField
                  control={form.control}
                  name="keyword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Keyword (100 characters max)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g., technology, AI, programming"
                          maxLength={100}
                          data-testid="input-block-keyword"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {field.value?.length || 0} / 100
                      </p>
                    </FormItem>
                  )}
                />

                {/* Color */}
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color (HEX)</FormLabel>
                      <FormControl>
                        <div className="flex gap-3 items-center">
                          <Input
                            type="color"
                            value={field.value}
                            onChange={field.onChange}
                            className="w-20 h-10 cursor-pointer"
                            data-testid="input-block-color"
                          />
                          <Input
                            value={field.value}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                field.onChange(val);
                              }
                            }}
                            placeholder="#3B82F6"
                            maxLength={7}
                            className="flex-1"
                            data-testid="input-block-color-hex"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Placement */}
                <FormField
                  control={form.control}
                  name="placement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Placement on Homepage</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-block-placement">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {placementOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Layout Style */}
                <FormField
                  control={form.control}
                  name="layoutStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Layout Style</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-block-layout-style">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {layoutStyleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {field.value === 'grid' && 'Display articles in 4-column grid (suitable for showing multiple articles)'}
                        {field.value === 'list' && 'Display articles in vertical list with large images (suitable for quick reading)'}
                        {field.value === 'featured' && 'Large featured article + small articles (suitable for highlighting one article)'}
                      </p>
                    </FormItem>
                  )}
                />

                {/* Limit Count */}
                <FormField
                  control={form.control}
                  name="limitCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Articles ({field.value || 6})</FormLabel>
                      <FormControl>
                        <Slider
                          min={1}
                          max={24}
                          step={1}
                          value={[field.value || 6]}
                          onValueChange={([value]) => field.onChange(value)}
                          data-testid="slider-block-limit"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        Will display {field.value || 6} articles in this block
                      </p>
                    </FormItem>
                  )}
                />

                {/* Is Active */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Activate Block</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-block-active"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Preview */}
                <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
                  <p className="text-sm font-medium">Live Preview:</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: formValues.color }}
                    />
                    <h3 
                      className="text-xl font-bold" 
                      style={{ color: formValues.color }}
                      data-testid="preview-title"
                    >
                      {formValues.title || 'Block Title'}
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Keyword: {formValues.keyword || 'Not specified'}</p>
                    <p>Placement: {getPlacementLabel(formValues.placement || 'below_featured')}</p>
                    <p>Layout: {getLayoutStyleLabel(formValues.layoutStyle || 'grid')}</p>
                    <p>Articles Count: {formValues.limitCount}</p>
                    <p>Status: {formValues.isActive ? 'Active' : 'Inactive'}</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCloseDialog} 
                    data-testid="button-cancel-smart-block"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-smart-block"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Saving...'
                      : editingBlock
                      ? 'Update'
                      : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this smart block? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </EnglishDashboardLayout>
  );
}

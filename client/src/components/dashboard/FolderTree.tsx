import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Folder, FolderOpen, ChevronDown, ChevronLeft, Star, FileIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MediaFolder } from "@shared/schema";

interface FolderTreeProps {
  folders: MediaFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectFavorites: () => void;
  isFavoritesSelected: boolean;
  fileCounts?: Record<string, number>;
}

interface TreeNodeProps {
  folder: MediaFolder;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  fileCount: number;
  children?: TreeNodeProps[];
}

function TreeNode({
  folder,
  level,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  fileCount,
  children,
}: TreeNodeProps) {
  const hasChildren = children && children.length > 0;

  return (
    <div>
      <Button
        variant={isSelected ? "secondary" : "ghost"}
        className="w-full justify-start gap-2 text-right h-8 px-2"
        style={{ paddingRight: `${level * 12 + 8}px` }}
        onClick={onSelect}
        data-testid={`button-folder-${folder.id}`}
      >
        {hasChildren && (
          <button
            className="hover:bg-accent rounded p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            data-testid={`button-toggle-folder-${folder.id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </button>
        )}
        {!hasChildren && <span className="w-4" />}
        
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 shrink-0" />
        )}
        
        <span className="flex-1 truncate text-sm">{folder.name}</span>
        
        {fileCount > 0 && (
          <Badge variant="outline" className="text-xs px-1 min-w-[20px]">
            {fileCount}
          </Badge>
        )}
      </Button>

      {hasChildren && isExpanded && (
        <div className="mt-0.5">
          {children.map((child) => (
            <TreeNode key={child.folder.id} {...child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onSelectFavorites,
  isFavoritesSelected,
  fileCounts = {},
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Build tree structure
  const buildTree = (parentId: string | null = null): TreeNodeProps[] => {
    return folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => ({
        folder,
        level: parentId === null ? 0 : 1, // Simple 2-level tree
        isExpanded: expandedFolders.has(folder.id),
        isSelected: selectedFolderId === folder.id,
        onToggle: () => toggleFolder(folder.id),
        onSelect: () => onSelectFolder(folder.id),
        fileCount: fileCounts[folder.id] || 0,
        children: buildTree(folder.id),
      }));
  };

  const tree = buildTree();
  const totalFiles = Object.values(fileCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-1">
      {/* All Files */}
      <Button
        variant={selectedFolderId === null && !isFavoritesSelected ? "secondary" : "ghost"}
        className="w-full justify-start gap-2 text-right h-8 px-2"
        onClick={() => onSelectFolder(null)}
        data-testid="button-all-files"
      >
        <FileIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-sm">جميع الملفات</span>
        {totalFiles > 0 && (
          <Badge variant="outline" className="text-xs px-1 min-w-[20px]">
            {totalFiles}
          </Badge>
        )}
      </Button>

      {/* Favorites */}
      <Button
        variant={isFavoritesSelected ? "secondary" : "ghost"}
        className="w-full justify-start gap-2 text-right h-8 px-2"
        onClick={onSelectFavorites}
        data-testid="button-favorites"
      >
        <Star className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-sm">المفضلة</span>
      </Button>

      {/* Folder Tree */}
      {tree.length > 0 && (
        <div className="pt-2 border-t">
          {tree.map((node) => (
            <TreeNode key={node.folder.id} {...node} />
          ))}
        </div>
      )}
    </div>
  );
}

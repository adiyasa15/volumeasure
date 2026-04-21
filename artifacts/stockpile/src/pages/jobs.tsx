import { useListJobs } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, Plus, Search, Layers, Pickaxe } from "lucide-react";
import { useState, useMemo } from "react";

export default function Jobs() {
  const { data: jobs, isLoading } = useListJobs();
  const [search, setSearch] = useState("");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    
    return jobs.filter((job) => {
      const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase());
      const matchesMaterial = materialFilter === "all" || job.materialType === materialFilter;
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      
      return matchesSearch && matchesMaterial && matchesStatus;
    });
  }, [jobs, search, materialFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">Measurements</h1>
          <p className="text-muted-foreground">All stockpile volumetric analysis jobs.</p>
        </div>
        <Link href="/jobs/new">
          <Button className="font-mono uppercase">
            <Plus className="mr-2 h-4 w-4" /> New Measurement
          </Button>
        </Link>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              className="pl-8 bg-background/50 font-mono text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={materialFilter} onValueChange={setMaterialFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background/50 font-mono text-sm uppercase">
              <SelectValue placeholder="Material" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Materials</SelectItem>
              <SelectItem value="sand">Sand</SelectItem>
              <SelectItem value="soil">Soil</SelectItem>
              <SelectItem value="coal">Coal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background/50 font-mono text-sm uppercase">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-bold font-mono uppercase mb-1">No jobs found</h3>
            <p className="text-muted-foreground max-w-sm">
              {jobs?.length === 0 
                ? "You haven't created any measurement jobs yet." 
                : "No jobs match your current search filters."}
            </p>
            {jobs?.length === 0 && (
              <Link href="/jobs/new" className="mt-4">
                <Button variant="outline" className="font-mono uppercase">Create Job</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono uppercase text-xs">Name</TableHead>
                  <TableHead className="font-mono uppercase text-xs">Material</TableHead>
                  <TableHead className="font-mono uppercase text-xs">Status</TableHead>
                  <TableHead className="font-mono uppercase text-xs text-right">Volume (m³)</TableHead>
                  <TableHead className="font-mono uppercase text-xs text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-secondary/30 transition-colors group">
                    <TableCell>
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:text-primary transition-colors block py-2">
                        {job.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm uppercase text-muted-foreground">
                      {job.materialType}
                    </TableCell>
                    <TableCell>
                      {job.status === 'completed' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-primary/20 text-primary border border-primary/30">
                          {job.status}
                        </span>
                      ) : job.status === 'running' || job.status === 'queued' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {job.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono uppercase bg-destructive/20 text-destructive border border-destructive/30">
                          {job.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {job.volumeM3 ? job.volumeM3.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm font-mono">
                      {format(new Date(job.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
"use client";
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, MessageSquare, Network, CheckCircle2, AlertTriangle, BarChart, Upload, FileJson } from 'lucide-react';
import { useClassificationResults } from '../hooks/useClassificationResults';
import { useQueries, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';

// TypeScript interfaces (declare your interfaces here)
interface EmailAddress {
  address: string;
  name?: string;
}

interface Recipient {
  emailAddress: EmailAddress;
}

interface EmailDetails {
  id: string;
  subject: string;
  sender: string;
  recipients: Recipient[];
  sent_date: string;
  body: string;
}

interface DomainAnalysis {
  sender_is_company?: boolean;
  sender_is_generic?: boolean;
  sender_domain?: string;
  recipient_domains?: string[];
  recipient_analysis: {
    company_domains?: number;
    generic_domains?: number;
    other_domains?: number;
  };
  is_likely_candidate_email?: boolean;
  confidence?: number;
  reasoning: string[];
  job_related_indicators: {
    has_company_sender?: boolean;
    has_generic_recipients?: boolean;
    is_internal_communication?: boolean;
  };
}

interface Classification {
  category: string;
  confidence: number;
  rationale?: string;
  uncertainty_points?: string[];
}

interface SimilarEmail {
  Subject: string;
  From: string;
  Date: string;
  Score: string;
}

interface Question {
  question: string;
  purpose?: string;
}

interface IterationResult {
  iteration: number;
  classification: Classification;
  questions: Record<string, Question[]> | Question[] | null;
  additional_context: string[] | null;
}

interface ClassificationProcess {
  iterations: IterationResult[];
  total_iterations: number;
  final_result: Classification;
}

export interface EmailClassificationResult {
  email_details: EmailDetails;
  domain_analysis: DomainAnalysis;
  initial_classification: Classification;
  similar_emails: SimilarEmail[];
  classification_process: ClassificationProcess;
  status: string;
}

interface ApiResponse {
  status: string;
  results: EmailClassificationResult[];
  total_processed: number;
  next_skip?: number;
}

const API_BASE_URL = 'http://localhost:8000';

const queryClient = new QueryClient();

const ClassificationDashboardWrapper = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ClassificationDashboardContent />
    </QueryClientProvider>
  );
};

const ClassificationDashboardContent = () => {
  // State management
  const [jsonResults, setJsonResults] = useState<EmailClassificationResult[]>([]);
  const [activeDataSource, setActiveDataSource] = useState<'api' | 'json'>('api');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentSkip, setCurrentSkip] = useState(30);
  const [hasMore, setHasMore] = useState(true);
  const [jsonFileUploaded, setJsonFileUploaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
  const [currentDisplaySkip, setCurrentDisplaySkip] = useState(0);
  const [currentDisplayLimit, setCurrentDisplayLimit] = useState(1500);
  const [processingSkip, setProcessingSkip] = useState(1230);
  const [processingBatchSize, setProcessingBatchSize] = useState(100);

  // Use API results from our custom hook
  const { data: resultsData,isError,isLoading } = useClassificationResults({
    skip: currentDisplaySkip,
    limit: currentDisplayLimit,
    // category: selectedCategory
  });

  const processEmailsMutation = useEmailProcessing(queryClient);

  // Use useQueries to monitor task statuses
  const taskStatusQueries = useQueries({
    queries: activeTaskIds.map(taskId => ({
      queryKey: ['taskStatus', taskId],
      queryFn: () => axios.get(`${API_BASE_URL}/task-status/${taskId}`).then(res => res.data),
      enabled: Boolean(taskId),
      refetchInterval: 3000,
    }))
  });

  // Remove tasks that have completed
  useEffect(() => {
    const completedTaskIds = taskStatusQueries
      .filter(query => query.data && query.data.status === 'completed')
      .map((_, index) => activeTaskIds[index]);
    if (completedTaskIds.length > 0) {
      setActiveTaskIds(prev => prev.filter(id => !completedTaskIds.includes(id)));
    }
  }, [taskStatusQueries, activeTaskIds]);

  // Helper function to get current results (from API or JSON)
  const getCurrentResults = (): EmailClassificationResult[] => {
    return activeDataSource === 'api'
      ? (resultsData?.results || [])
      : jsonResults;
  };

  // Helper to filter results by selected category
  const getFilteredResults = (): EmailClassificationResult[] => {
    const currentResults = getCurrentResults();
    if (!selectedCategory) return currentResults;
    
    return currentResults.filter(result => {
      // Only check the final classification category
      return result?.classification_process?.final_result?.category === selectedCategory;
    });
  };
  

  const clearCategoryFilter = () => {
    setSelectedCategory(null);
  };

  // File upload handler for JSON results
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const jsonData = JSON.parse(content);
        console.log("Loaded JSON data:", typeof jsonData);

        if (Array.isArray(jsonData)) {
          setJsonResults(jsonData);
          setJsonFileUploaded(true);
          setActiveDataSource('json');
        } else if (jsonData && jsonData.results && Array.isArray(jsonData.results)) {
          setJsonResults(jsonData.results);
          setJsonFileUploaded(true);
          setActiveDataSource('json');
        } else if (jsonData && typeof jsonData === 'object' && jsonData.status && jsonData.results) {
          setJsonResults(jsonData.results);
          setJsonFileUploaded(true);
          setActiveDataSource('json');
        } else if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
          setJsonResults([jsonData]);
          setJsonFileUploaded(true);
          setActiveDataSource('json');
        } else {
          setError('Unrecognized JSON format. Please ensure the file contains email classification results.');
        }
      } catch (err) {
        setError('Error parsing JSON file. Please ensure the file contains valid JSON.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Error reading file.');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  const classifyBulkEmails = async () => {
    try {
      setLoading(true);
      const result = await processEmailsMutation.mutateAsync({
        totalEmails: 200,
        batchSize: processingBatchSize,
       skip: processingSkip, 
      });

      if (result.next_skip) {
        setProcessingSkip(result.next_skip);
        console.log("next skip",processingSkip)
      } else {
        // If no next_skip is provided, calculate it manually
        setProcessingSkip(processingSkip + processingBatchSize); // batchSize is 50
      }
      if (result.task_ids) {
        setActiveTaskIds(prev => [...prev, ...result.task_ids]);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while processing emails');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const resetProcessing = () => {
    setCurrentDisplaySkip(0);
    setSelectedCategory(null);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['classificationResults'] });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {resultsData.error.message}</div>;
  }

  // Get category summary for display
  const getCategorySummary = () => {
    const summary: { [key: string]: number } = {};
    const currentResults = getCurrentResults();
    
    currentResults.forEach(result => {
      // Use only the final classification category to be consistent
      const category = result?.classification_process?.final_result?.category || 'Unknown';
      summary[category] = (summary[category] || 0) + 1;
    });
    
    return summary;
  };

  // Get the filtered results for display
  const filteredResults = getFilteredResults();

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Data Source Controls */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Email Classification Dashboard</h1>
        <div className="flex items-center gap-4">
          {activeDataSource === 'api' && progress > 0 && (
            <div className="text-sm text-gray-600">Processed: {progress} emails</div>
          )}

          <div className="flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setActiveDataSource('api')}
              className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                activeDataSource === 'api'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-200`}
            >
              API Data
            </button>
            <button
              type="button"
              onClick={() => setActiveDataSource('json')}
              className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                activeDataSource === 'json'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-l-0 border-gray-200`}
            >
              JSON File
            </button>
          </div>

          {activeDataSource === 'api' ? (
            <Button
              onClick={classifyBulkEmails}
              disabled={loading || !hasMore}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              {loading ? 'Processing...' : hasMore ? 'Process Next Batch' : 'No More Emails'}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor="json-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md">
                  <FileJson className="h-4 w-4" />
                  <span>{jsonFileUploaded ? 'Upload Another JSON' : 'Upload JSON File'}</span>
                </div>
                <input
                  type="file"
                  id="json-upload"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={loading}
                />
              </label>
            </div>
          )}

          {((activeDataSource === 'api' && progress > 0) || (activeDataSource === 'json' && jsonFileUploaded)) && (
            <Button onClick={resetProcessing} variant="outline" disabled={loading}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Category Summary Card */}
      {getCurrentResults().length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Category Summary {activeDataSource === 'api' ? '(API Data)' : '(JSON File)'}
            </CardTitle>
            {selectedCategory && (
              <Button variant="outline" size="sm" onClick={clearCategoryFilter} className="text-sm">
                Clear Filter
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(getCategorySummary()).map(([category, count]) => (
                <div
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`bg-gray-50 p-4 rounded-lg shadow cursor-pointer transition-colors ${
                    selectedCategory === category ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-500">{category}</div>
                  <div className="mt-1 text-2xl font-semibold">{count}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600 flex justify-between items-center">
              <span>Total Emails: {getCurrentResults().length}</span>
              {selectedCategory && (
                <span className="font-medium">
                  Showing {filteredResults.length} {selectedCategory} emails
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {/*Pagination controls*/}
      <div className="flex justify-between items-center mt-4">
        <Button 
          onClick={() => setCurrentDisplaySkip(Math.max(0, currentDisplaySkip - currentDisplayLimit))}
          disabled={currentDisplaySkip === 0 || loading}
          variant="outline"
        >
          Previous Page
        </Button>
        
        <span className="text-sm">
          {resultsData?.total ? (
            // If we know the total, show accurate bounds
            `Showing results ${Math.min(currentDisplaySkip + 1, resultsData.total)} - 
            ${Math.min(currentDisplaySkip + filteredResults.length, resultsData.total)} 
            of ${resultsData.total}`
          ) : (
            // If we don't know the total
            `Showing results ${currentDisplaySkip + 1} - ${currentDisplaySkip + filteredResults.length}`
          )}
        </span>
        
        <Button 
          onClick={() => setCurrentDisplaySkip(currentDisplaySkip + currentDisplayLimit)}
          // Disable when we're at the end of data
          disabled={
            filteredResults.length < currentDisplayLimit || // Not a full page
            (resultsData?.total && currentDisplaySkip + currentDisplayLimit >= resultsData.total) || // At the end
            loading
          }
          variant="outline"
        >
          Next Page
        </Button>
      </div>
      {/* Display Results - Key fix: Use filteredResults consistently */}
      {filteredResults.length > 0 ? (
        filteredResults.map((result, idx) => (
          <div key={`${result?.email_details?.id || idx}-${idx}`} className="space-y-6">
            {/* Render Email Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div>
                    <p className="font-semibold">Subject:</p>
                    <p className="text-gray-600">{result?.email_details?.subject || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="font-semibold">From:</p>
                    <p className="text-gray-600">{result?.email_details?.sender || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="font-semibold">To:</p>
                    <p className="text-gray-600">
                      {result?.email_details?.recipients?.map(r => r?.emailAddress?.address).join(', ') || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Body:</p>
                    <p className="text-gray-600 whitespace-pre-wrap text-wrap">{result?.email_details?.body || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Render Domain Analysis Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Domain Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-semibold">Sender Domain:</p>
                      <p className="text-gray-600">{result?.domain_analysis?.sender_domain || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="font-semibold">Is Company Sender:</p>
                      <span
                        className={`px-2 py-1 rounded-full ${
                          result?.domain_analysis?.sender_is_company
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {result?.domain_analysis?.sender_is_company ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold">Analysis Reasoning:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {result?.domain_analysis?.reasoning?.map((reason, index) => (
                        <li key={index} className="text-gray-600">
                          {reason}
                        </li>
                      )) || <li className="text-gray-600">No reasoning available</li>}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Render Initial Classification Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Initial Classification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Category:</span>
                    <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                      {result?.initial_classification?.category || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Confidence:</span>
                    <span className={`px-2 py-1 rounded-full ${getConfidenceColor(result?.initial_classification?.confidence || 0)}`}>
                      {((result?.initial_classification?.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">Uncertainty Points:</p>
                    {result?.initial_classification?.uncertainty_points &&
                    result.initial_classification.uncertainty_points.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {result.initial_classification.uncertainty_points.map((point, index) => (
                          <li key={index} className="text-gray-600">
                            {point}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-600 ml-5">No uncertainty points</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Render Classification Process Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart className="h-5 w-5" />
                  Classification Process
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result?.classification_process?.iterations ? (
                  <div className="space-y-6">
                    {result.classification_process.iterations.map((iteration, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-4">Iteration {iteration?.iteration || index}</h3>
                        <div className="space-y-4">
                          <div>
                            <p className="font-semibold">Classification:</p>
                            <div className="ml-4 space-y-2">
                              <div className="flex items-center gap-2">
                                <span>Category:</span>
                                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                                  {iteration?.classification?.category || 'Unknown'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span>Confidence:</span>
                                <span className={`px-2 py-1 rounded-full ${getConfidenceColor(iteration?.classification?.confidence || 0)}`}>
                                  {((iteration?.classification?.confidence || 0) * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div>
                                <p className="font-semibold">Rationale:</p>
                                <p className="text-gray-600">{iteration?.classification?.rationale || 'No rationale provided'}</p>
                              </div>
                            </div>
                          </div>
                          {iteration?.questions && (
                            <div>
                              <p className="font-semibold">Questions Generated:</p>
                              <div className="ml-4">
                                {Array.isArray(iteration.questions) ? (
                                  <ul className="list-disc pl-5">
                                    {iteration.questions.map((q, i) => (
                                      <li key={i} className="text-gray-600">
                                        {typeof q === 'object' && q !== null && 'question' in q ? q.question : String(q)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  Object.entries(iteration.questions).map(([stage, questions]) => (
                                    <div key={stage} className="mt-2">
                                      <p className="font-medium">{stage.replace(/_/g, ' ')}:</p>
                                      <ul className="list-disc pl-5">
                                        {Array.isArray(questions) &&
                                          questions.map((q, i) => (
                                            <li key={i} className="text-gray-600">
                                              {typeof q === 'object' && q !== null && 'question' in q ? q.question : String(q)}
                                            </li>
                                          ))}
                                      </ul>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                          {iteration?.additional_context && iteration.additional_context.length > 0 && (
                            <div>
                              <p className="font-semibold">Additional Context:</p>
                              <ul className="list-disc pl-5">
                                {iteration.additional_context.map((context, i) => (
                                  <li key={i} className="text-gray-600">{context}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">No classification process information available</p>
                )}
              </CardContent>
            </Card>

            {/* Render Similar Emails Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Similar Emails
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result?.similar_emails && result.similar_emails.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {result.similar_emails.map((email, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{email?.Subject || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{email?.From || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {email?.Date ? new Date(email.Date).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {email?.Score ? `${(parseFloat(email.Score) * 100).toFixed(0)}%` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-600">No similar emails found</p>
                )}
              </CardContent>
            </Card>
          </div>
        ))
      ) : (
        getCurrentResults().length > 0 && selectedCategory ? (
          <div className="text-center py-8">
            <p className="text-lg text-gray-600">No emails found in the "{selectedCategory}" category.</p>
            <Button onClick={clearCategoryFilter} variant="outline" className="mt-4">
              Clear Filter
            </Button>
          </div>
        ) : null
      )}
    </div>
  );
};

export default ClassificationDashboardWrapper;
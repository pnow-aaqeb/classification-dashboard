"use client"
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, MessageSquare, Network, CheckCircle2, AlertTriangle, BarChart } from 'lucide-react';

// TypeScript interfaces
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
  sender_is_company: boolean;
  sender_is_generic: boolean;
  sender_domain: string;
  recipient_domains: string[];
  recipient_analysis: {
    company_domains: number;
    generic_domains: number;
    other_domains: number;
  };
  is_likely_candidate_email: boolean;
  confidence: number;
  reasoning: string[];
  job_related_indicators: {
    has_company_sender: boolean;
    has_generic_recipients: boolean;
    is_internal_communication: boolean;
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

interface EmailClassificationResult {
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
}
const ClassificationDashboard = () => {
  // Updated state management
  const [results, setResults] = useState<EmailClassificationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Function to filter results by category
  const getFilteredResults = () => {
    if (!selectedCategory) return results;
    return results.filter(
      result => result.classification_process.final_result.category === selectedCategory
    );
  };

  // Function to clear category filter
  const clearCategoryFilter = () => {
    setSelectedCategory(null);
  };

  const processStreamResponse = async (reader: ReadableStreamDefaultReader) => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          break;
        }
        
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status === 'error') {
              setError(data.message);
              continue;
            }
            
            setResults(prevResults => [...prevResults, ...data.results]);
            setProgress(prevProgress => prevProgress + data.total_processed);
          } catch (e) {
            console.error('Error parsing line:', e);
          }
        }
      }
    } catch (error) {
      setError(`Stream processing error: ${error}`);
    }
  };

  const classifyBulkEmails = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    
    try {
      const response = await fetch('http://localhost:8000/process-emails', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is undefined');
      }
      const reader = response.body.getReader();
      await processStreamResponse(reader);
      
    } catch (err) {
      console.error(err);
      // setError(err.message || 'An error occurred while classifying emails.');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Email Classification Dashboard</h1>
        <div className="flex items-center gap-4">
          {loading && (
            <div className="text-sm text-gray-600">
              Processed: {progress} emails
            </div>
          )}
          <Button 
            onClick={classifyBulkEmails} 
            disabled={loading}
            className="flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            {loading ? 'Processing...' : 'Bulk Classify Emails'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Display */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Category Summary
            </CardTitle>
            {selectedCategory && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCategoryFilter}
                className="text-sm"
              >
                Clear Filter
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(
                results.reduce((acc, result) => {
                  const category = result.classification_process.final_result.category;
                  acc[category] = (acc[category] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([category, count]) => (
                <div
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`bg-gray-50 p-4 rounded-lg shadow cursor-pointer transition-colors
                    ${selectedCategory === category ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-100'}`}
                >
                  <div className="text-sm font-medium text-gray-500">{category}</div>
                  <div className="mt-1 text-2xl font-semibold">{count}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600 flex justify-between items-center">
              <span>Total Emails Processed: {results.length}</span>
              {selectedCategory && (
                <span className="font-medium">
                  Showing {getFilteredResults().length} {selectedCategory} emails
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
        {getFilteredResults().map((result, idx) => (
        <div key={`${result.email_details.id}-${idx}`} className="space-y-6">
              {/* Email Details Card - Adding this back */}
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
                  <p className="text-gray-600">{result.email_details.subject}</p>
                </div>
                <div>
                  <p className="font-semibold">From:</p>
                  <p className="text-gray-600">{result.email_details.sender}</p>
                </div>
                <div>
                  <p className="font-semibold">To:</p>
                  <p className="text-gray-600">
                    {result.email_details.recipients.map(r => r.emailAddress.address).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Body:</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{result.email_details.body}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Domain Analysis */}
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
                    <p className="text-gray-600">{result.domain_analysis.sender_domain}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Is Company Sender:</p>
                    <span className={`px-2 py-1 rounded-full ${result.domain_analysis.sender_is_company ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {result.domain_analysis.sender_is_company ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="font-semibold">Analysis Reasoning:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {result.domain_analysis.reasoning.map((reason, index) => (
                      <li key={index} className="text-gray-600">{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Initial Classification */}
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
                    {result.initial_classification.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Confidence:</span>
                  <span className={`px-2 py-1 rounded-full ${getConfidenceColor(result.initial_classification.confidence)}`}>
                    {(result.initial_classification.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <p className="font-semibold">Uncertainty Points:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {result.initial_classification.uncertainty_points?.map((point, index) => (
                      <li key={index} className="text-gray-600">{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Classification Process */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-5 w-5" />
                Classification Process
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {result.classification_process.iterations.map((iteration, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">
                      Iteration {iteration.iteration}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <p className="font-semibold">Classification:</p>
                        <div className="ml-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span>Category:</span>
                            <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                              {iteration.classification.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>Confidence:</span>
                            <span className={`px-2 py-1 rounded-full ${getConfidenceColor(iteration.classification.confidence)}`}>
                              {(iteration.classification.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold">Rationale:</p>
                            <p className="text-gray-600">{iteration.classification.rationale}</p>
                          </div>
                        </div>
                      </div>

                      {iteration.questions && (
                        <div>
                          <p className="font-semibold">Questions Generated:</p>
                          <div className="ml-4">
                            {Array.isArray(iteration.questions) ? (
                              <ul className="list-disc pl-5">
                                {iteration.questions.map((q, i) => (
                                  <li key={i} className="text-gray-600">
                                    {typeof q === 'object' && q !== null && 'question' in q 
                                      ? q.question 
                                      : String(q)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              Object.entries(iteration.questions).map(([stage, questions]) => (
                                <div key={stage} className="mt-2">
                                  <p className="font-medium">{stage.replace(/_/g, ' ')}:</p>
                                  <ul className="list-disc pl-5">
                                    {Array.isArray(questions) && questions.map((q, i) => (
                                      <li key={i} className="text-gray-600">
                                        {typeof q === 'object' && q !== null && 'question' in q 
                                          ? q.question 
                                          : String(q)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {iteration.additional_context && (
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
            </CardContent>
          </Card>

          {/* Similar Emails */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Similar Emails
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{email.Subject}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{email.From}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(email.Date).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(parseFloat(email.Score) * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
};


export default ClassificationDashboard;
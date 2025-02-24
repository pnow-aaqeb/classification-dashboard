// hooks/useClassificationQueries.ts
import { useQuery, useMutation, QueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

export const useClassificationQueries = ({
  queryClient,
  skip = 0,
  limit = 10,
  category = null
}: {
  queryClient: QueryClient;
  skip?: number;
  limit?: number;
  category?: string | null;
}) => {

  // Query for fetching results
  const resultsQuery = useQuery({
    queryKey: ['classificationResults', skip, limit, category],
    queryFn: async () => {
      const endpoint = category 
        ? `${API_BASE_URL}/classification-results/category/${category}`
        : `${API_BASE_URL}/classification-results`;
      
      console.log(`Fetching data from ${endpoint} with skip=${skip}, limit=${limit}`);
      
      try {
        const response = await axios.get(endpoint);
        console.log('Response data:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error fetching classification results:', error);
        throw error;
      }
    },
    // Refresh data every 5 seconds to get latest classifications
    refetchInterval: 5000,
    staleTime: 3000,
    retry: 3
  });

  // Mutation for processing new batch
  const processEmailsMutation = useMutation({
    mutationFn: async ({
      totalEmails,
      batchSize,
      skip
    }: {
      totalEmails: number;
      batchSize: number;
      skip: number;
    }) => {
      try {
        console.log(`Processing batch with totalEmails=${totalEmails}, batchSize=${batchSize}, skip=${skip}`);
        
        const response = await axios.post(
          `${API_BASE_URL}/process-email-batches`,
          null,
          {
            params: {
              total_emails: totalEmails,
              batch_size: batchSize,
              skip
            }
          }
        );
        
        console.log('Batch processing response:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error processing email batch:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Batch processing successful, invalidating queries');
      // Invalidate classification results query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ['classificationResults'] });
    }
  });

  return {
    resultsQuery,
    processEmailsMutation,
    useTaskStatus
  };
};

// Separate hook for task status to avoid hook rule violations
export const useTaskStatus = (taskId: string) => {
  return useQuery({
    queryKey: ['taskStatus', taskId],
    queryFn: async () => {
      try {
        console.log(`Checking status for task ${taskId}`);
        const response = await axios.get(`${API_BASE_URL}/task-status/${taskId}`);
        console.log(`Task ${taskId} status:`, response.data);
        return response.data;
      } catch (error) {
        console.error(`Error checking task ${taskId} status:`, error);
        throw error;
      }
    },
    enabled: !!taskId,
    refetchInterval: (data) => {
      // Check status every 3 seconds until task is completed or failed
      return (data?.isActive()|| data?.isDisabled() ? false : 3000);
    }
  });
};
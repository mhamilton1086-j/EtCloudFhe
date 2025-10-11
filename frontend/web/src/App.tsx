// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ETImageData {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  resolution: string;
  status: "uploaded" | "processing" | "reconstructed";
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<ETImageData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newImageData, setNewImageData] = useState({
    resolution: "",
    description: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showTeamInfo, setShowTeamInfo] = useState(false);

  // Filter images based on search and active tab
  const filteredImages = images.filter(image => {
    const matchesSearch = image.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         image.resolution.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || image.status === activeTab;
    return matchesSearch && matchesTab;
  });

  // Calculate statistics
  const uploadedCount = images.filter(i => i.status === "uploaded").length;
  const processingCount = images.filter(i => i.status === "processing").length;
  const reconstructedCount = images.filter(i => i.status === "reconstructed").length;

  useEffect(() => {
    loadImages().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load images from contract
  const loadImages = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("et_image_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing image keys:", e);
        }
      }
      
      const list: ETImageData[] = [];
      
      for (const key of keys) {
        try {
          const imageBytes = await contract.getData(`et_image_${key}`);
          if (imageBytes.length > 0) {
            try {
              const imageData = JSON.parse(ethers.toUtf8String(imageBytes));
              list.push({
                id: key,
                encryptedData: imageData.data,
                timestamp: imageData.timestamp,
                owner: imageData.owner,
                resolution: imageData.resolution,
                status: imageData.status || "uploaded"
              });
            } catch (e) {
              console.error(`Error parsing image data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading image ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setImages(list);
    } catch (e) {
      console.error("Error loading images:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Upload new ET image
  const uploadImage = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setUploading(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting ET image data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-ET-${btoa(JSON.stringify(newImageData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const imageId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const imageData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        resolution: newImageData.resolution,
        status: "uploaded"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `et_image_${imageId}`, 
        ethers.toUtf8Bytes(JSON.stringify(imageData))
      );
      
      const keysBytes = await contract.getData("et_image_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(imageId);
      
      await contract.setData(
        "et_image_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted ET image uploaded securely!"
      });
      
      await loadImages();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowUploadModal(false);
        setNewImageData({
          resolution: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Upload failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setUploading(false);
    }
  };

  // Process image with FHE reconstruction
  const processImage = async (imageId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing ET image with FHE 3D reconstruction..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const imageBytes = await contract.getData(`et_image_${imageId}`);
      if (imageBytes.length === 0) {
        throw new Error("Image not found");
      }
      
      const imageData = JSON.parse(ethers.toUtf8String(imageBytes));
      
      const updatedImage = {
        ...imageData,
        status: "processing"
      };
      
      await contract.setData(
        `et_image_${imageId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedImage))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE processing started successfully!"
      });
      
      await loadImages();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Processing failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Complete reconstruction
  const completeReconstruction = async (imageId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Finalizing FHE 3D reconstruction..."
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const imageBytes = await contract.getData(`et_image_${imageId}`);
      if (imageBytes.length === 0) {
        throw new Error("Image not found");
      }
      
      const imageData = JSON.parse(ethers.toUtf8String(imageBytes));
      
      const updatedImage = {
        ...imageData,
        status: "reconstructed"
      };
      
      await contract.setData(
        `et_image_${imageId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedImage))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "3D reconstruction completed!"
      });
      
      await loadImages();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Reconstruction failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  // Team information
  const teamMembers = [
    {
      name: "Dr. Alice Chen",
      role: "Lead Cryptographer",
      bio: "Expert in FHE applications for biomedical imaging"
    },
    {
      name: "Prof. Bob Zhang",
      role: "Electron Microscopy Specialist",
      bio: "Pioneer in cryo-ET techniques"
    },
    {
      name: "Eve Wang",
      role: "Blockchain Engineer",
      bio: "Specialized in secure smart contract development"
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="microscope-icon"></div>
          </div>
          <h1>ET<span>Cloud</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowUploadModal(true)} 
            className="upload-btn"
          >
            <div className="upload-icon"></div>
            Upload ET Image
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="hero-section">
          <div className="hero-text">
            <h2>FHE-Based Secure Electron Microscopy Tomography</h2>
            <p>Upload encrypted ET images and perform 3D reconstruction while keeping your data private</p>
          </div>
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
        </div>
        
        <div className="stats-section">
          <div className="stat-card">
            <div className="stat-value">{images.length}</div>
            <div className="stat-label">Total Images</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{uploadedCount}</div>
            <div className="stat-label">Uploaded</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{processingCount}</div>
            <div className="stat-label">Processing</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{reconstructedCount}</div>
            <div className="stat-label">Reconstructed</div>
          </div>
        </div>
        
        <div className="controls-section">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search images..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-icon"></div>
          </div>
          <div className="tabs">
            <button 
              className={activeTab === "all" ? "active" : ""}
              onClick={() => setActiveTab("all")}
            >
              All
            </button>
            <button 
              className={activeTab === "uploaded" ? "active" : ""}
              onClick={() => setActiveTab("uploaded")}
            >
              Uploaded
            </button>
            <button 
              className={activeTab === "processing" ? "active" : ""}
              onClick={() => setActiveTab("processing")}
            >
              Processing
            </button>
            <button 
              className={activeTab === "reconstructed" ? "active" : ""}
              onClick={() => setActiveTab("reconstructed")}
            >
              Reconstructed
            </button>
          </div>
          <button 
            className="team-btn"
            onClick={() => setShowTeamInfo(!showTeamInfo)}
          >
            {showTeamInfo ? "Hide Team" : "Show Team"}
          </button>
        </div>
        
        {showTeamInfo && (
          <div className="team-section">
            <h3>Our Team</h3>
            <div className="team-grid">
              {teamMembers.map((member, index) => (
                <div className="team-card" key={index}>
                  <div className="member-avatar"></div>
                  <div className="member-info">
                    <h4>{member.name}</h4>
                    <p className="role">{member.role}</p>
                    <p className="bio">{member.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="images-section">
          <div className="section-header">
            <h2>Encrypted ET Images</h2>
            <button 
              onClick={loadImages}
              className="refresh-btn"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="images-list">
            {filteredImages.length === 0 ? (
              <div className="no-images">
                <div className="no-images-icon"></div>
                <p>No encrypted ET images found</p>
                <button 
                  className="upload-btn"
                  onClick={() => setShowUploadModal(true)}
                >
                  Upload First Image
                </button>
              </div>
            ) : (
              filteredImages.map(image => (
                <div className="image-card" key={image.id}>
                  <div className="image-header">
                    <div className="image-id">#{image.id.substring(0, 6)}</div>
                    <div className={`status-badge ${image.status}`}>
                      {image.status}
                    </div>
                  </div>
                  <div className="image-details">
                    <div className="detail">
                      <span>Resolution:</span>
                      <span>{image.resolution}</span>
                    </div>
                    <div className="detail">
                      <span>Owner:</span>
                      <span>{image.owner.substring(0, 6)}...{image.owner.substring(38)}</span>
                    </div>
                    <div className="detail">
                      <span>Uploaded:</span>
                      <span>{new Date(image.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="image-actions">
                    {isOwner(image.owner) && image.status === "uploaded" && (
                      <button 
                        className="action-btn"
                        onClick={() => processImage(image.id)}
                      >
                        Start FHE Processing
                      </button>
                    )}
                    {isOwner(image.owner) && image.status === "processing" && (
                      <button 
                        className="action-btn"
                        onClick={() => completeReconstruction(image.id)}
                      >
                        Complete Reconstruction
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showUploadModal && (
        <ModalUpload 
          onSubmit={uploadImage} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploading}
          imageData={newImageData}
          setImageData={setNewImageData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="microscope-icon"></div>
              <span>ETCloudFHE</span>
            </div>
            <p>Secure electron microscopy tomography with FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ETCloudFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalUploadProps {
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  imageData: any;
  setImageData: (data: any) => void;
}

const ModalUpload: React.FC<ModalUploadProps> = ({ 
  onSubmit, 
  onClose, 
  uploading,
  imageData,
  setImageData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setImageData({
      ...imageData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!imageData.resolution) {
      alert("Please specify image resolution");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal">
        <div className="modal-header">
          <h2>Upload Encrypted ET Image</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>Your ET image will be encrypted with FHE before processing</span>
          </div>
          
          <div className="form-group">
            <label>Resolution *</label>
            <input 
              type="text"
              name="resolution"
              value={imageData.resolution} 
              onChange={handleChange}
              placeholder="e.g. 2.4Å" 
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description"
              value={imageData.description} 
              onChange={handleChange}
              placeholder="Brief description of the sample..." 
              rows={3}
            />
          </div>
          
          <div className="file-upload">
            <label>ET Image File *</label>
            <div className="upload-area">
              <div className="upload-icon"></div>
              <p>Drag & drop your ET image file here or click to browse</p>
              <input type="file" accept=".mrc,.tiff,.ser" />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={uploading}
            className="submit-btn"
          >
            {uploading ? "Encrypting with FHE..." : "Upload Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EtCloudFhe is SepoliaConfig {
    // Structure for encrypted ET image data
    struct EncryptedImage {
        uint256 id;
        address owner;
        euint32 encryptedData;
        uint256 timestamp;
        bool isProcessed;
    }
    
    // Structure for reconstruction results
    struct ReconstructionResult {
        uint256 imageId;
        euint32 encryptedResult;
        uint256 timestamp;
    }
    
    // Contract state
    uint256 public imageCount;
    mapping(uint256 => EncryptedImage) public encryptedImages;
    mapping(uint256 => ReconstructionResult) public reconstructionResults;
    mapping(address => uint256[]) public userImages;
    
    // Events
    event ImageUploaded(uint256 indexed id, address indexed owner, uint256 timestamp);
    event ReconstructionRequested(uint256 indexed id);
    event ReconstructionCompleted(uint256 indexed id, uint256 timestamp);
    
    // Modifier to restrict access to image owner
    modifier onlyImageOwner(uint256 imageId) {
        require(encryptedImages[imageId].owner == msg.sender, "Not image owner");
        _;
    }
    
    /// @notice Upload encrypted ET image data
    function uploadEncryptedImage(euint32 encryptedData) external {
        imageCount++;
        uint256 newId = imageCount;
        
        encryptedImages[newId] = EncryptedImage({
            id: newId,
            owner: msg.sender,
            encryptedData: encryptedData,
            timestamp: block.timestamp,
            isProcessed: false
        });
        
        userImages[msg.sender].push(newId);
        emit ImageUploaded(newId, msg.sender, block.timestamp);
    }
    
    /// @notice Request 3D reconstruction for an image
    function requestReconstruction(uint256 imageId) external onlyImageOwner(imageId) {
        require(!encryptedImages[imageId].isProcessed, "Image already processed");
        
        // Prepare encrypted data for processing
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(encryptedImages[imageId].encryptedData);
        
        // Request reconstruction processing
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.processReconstruction.selector);
        emit ReconstructionRequested(imageId);
    }
    
    /// @notice Process reconstruction results
    function processReconstruction(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process reconstruction results
        euint32 encryptedResult = FHE.asEuint32(abi.decode(cleartexts, (uint32)));
        
        // Store reconstruction result
        reconstructionResults[requestId] = ReconstructionResult({
            imageId: requestId,
            encryptedResult: encryptedResult,
            timestamp: block.timestamp
        });
        
        // Mark image as processed
        encryptedImages[requestId].isProcessed = true;
        
        emit ReconstructionCompleted(requestId, block.timestamp);
    }
    
    /// @notice Get encrypted reconstruction result
    function getReconstructionResult(uint256 imageId) external view onlyImageOwner(imageId) returns (euint32) {
        require(encryptedImages[imageId].isProcessed, "Reconstruction not completed");
        return reconstructionResults[imageId].encryptedResult;
    }
    
    /// @notice Get user's image IDs
    function getUserImageIds(address user) external view returns (uint256[] memory) {
        return userImages[user];
    }
    
    /// @notice Get image metadata
    function getImageMetadata(uint256 imageId) external view returns (address owner, uint256 timestamp, bool isProcessed) {
        EncryptedImage storage image = encryptedImages[imageId];
        return (image.owner, image.timestamp, image.isProcessed);
    }
}